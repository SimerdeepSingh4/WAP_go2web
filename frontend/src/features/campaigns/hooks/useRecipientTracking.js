import { useCallback, useMemo, useRef, useState } from "react";
import { emptyRecipientActivity, recordRecipientPaste, recordRecipientChange, restoreRecipientActivity, updateRecipientMarks, recipientMarkTokens, recipientNumberFlags } from "../lib/recipientInputAudit";
import { recipientEditError } from "../lib/submission";

export default function useRecipientTracking() {
  const [state, setState] = useState(() => ({ text: "", rows: [], sourceMemory: [], activity: emptyRecipientActivity() }));
  const current = useRef(state);
  const pastePending = useRef(false);
  const selection = useRef(null);
  const [inputError, setInputError] = useState(null);
  const commit = useCallback(next => { current.current = next; setState(next); }, []);
  function change(text) {
    text = text.replace(/\r\n?/g, "\n");
    const error = recipientEditError(text);
    setInputError(error);
    if (error) { selection.current = null; pastePending.current = false; return false; }
    const before = current.current;
    commit({ ...updateRecipientMarks(before, text, pastePending.current ? "pasted" : "manual", selection.current), activity: recordRecipientChange(before.activity, text, !pastePending.current, text !== before.text) });
    selection.current = null;
    pastePending.current = false;
    return true;
  }
  function onPaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\r\n?/g, "\n");
    if (!pasted) return;
    const input = event.currentTarget;
    const next = input.value.slice(0, input.selectionStart) + pasted + input.value.slice(input.selectionEnd);
    const error = recipientEditError(next);
    setInputError(error);
    if (error) { event.preventDefault(); return; }
    pastePending.current = true;
    selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    commit({ ...current.current, activity: recordRecipientPaste(current.current.activity) });
    // A canceled or no-op paste must not suppress a later manual input.
    setTimeout(() => { pastePending.current = false; }, 0);
  }
  const restore = useCallback((text, saved) => {
    text = text.replace(/\r\n?/g, "\n");
    const flags = new Map(saved?.numberFlags || []);
    commit({ text, rows: recipientMarkTokens(text).map((row, index) => ({ ...row, source: flags.get(index + 1) === 2 ? "edited" : flags.get(index + 1) === 1 ? "manual" : saved?.hasPasted ? "pasted" : "unknown" })), sourceMemory: Array.isArray(saved?.sourceMemory) ? saved.sourceMemory : [], activity: restoreRecipientActivity(saved, text) });
  }, [commit]);
  function appendFile(content) {
    const before = current.current;
    const text = (before.text ? before.text + "\n" + content : content).replace(/\r\n?/g, "\n");
    const error = recipientEditError(text);
    setInputError(error);
    if (error) return false;
    commit({ ...updateRecipientMarks(before, text, "imported", {start:before.text.length,end:before.text.length}), activity: recordRecipientChange(before.activity, text, false) });
    return true;
  }
  const audit = useMemo(() => ({ ...state.activity, numberFlags: recipientNumberFlags(state.rows) }), [state.activity, state.rows]);
  const tracking = useMemo(() => ({ ...audit, sourceMemory: state.sourceMemory }), [audit, state.sourceMemory]);
  return { rawRecipients: state.text, change, restore, tracking, audit, onPaste, appendFile, inputError,
    onBeforeInput: event => {
      const data = event.data ?? event.nativeEvent?.data;
      const input = event.currentTarget;
      if (typeof data === "string") {
        const error = recipientEditError(input.value.slice(0, input.selectionStart) + data + input.value.slice(input.selectionEnd));
        setInputError(error);
        if (error) { event.preventDefault(); return; }
      }
      if (!pastePending.current) selection.current = {start:input.selectionStart,end:input.selectionEnd};
    },
  };
}
