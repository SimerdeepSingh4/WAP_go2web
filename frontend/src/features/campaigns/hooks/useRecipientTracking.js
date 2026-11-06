import { useMemo, useRef, useState } from "react";
import { emptyRecipientActivity, recordRecipientPaste, recordRecipientChange, restoreRecipientActivity, updateRecipientMarks, recipientMarkTokens, recipientNumberFlags } from "../lib/recipientInputAudit";

export default function useRecipientTracking() {
  const [state, setState] = useState(() => ({ text: "", rows: [], sourceMemory: [], activity: emptyRecipientActivity() }));
  const current = useRef(state);
  const pastePending = useRef(false);
  const selection = useRef(null);
  function commit(next) { current.current = next; setState(next); }
  function change(text) {
    text = text.replace(/\r\n?/g, "\n");
    const before = current.current;
    commit({ ...updateRecipientMarks(before, text, pastePending.current ? "pasted" : "manual", selection.current), activity: recordRecipientChange(before.activity, text, !pastePending.current, text !== before.text) });
    selection.current = null;
    pastePending.current = false;
  }
  function onPaste(event) {
    if (!event.clipboardData.getData("text")) return;
    pastePending.current = true;
    selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    commit({ ...current.current, activity: recordRecipientPaste(current.current.activity) });
    // A canceled or no-op paste must not suppress a later manual input.
    setTimeout(() => { pastePending.current = false; }, 0);
  }
  function restore(text, saved) {
    text = text.replace(/\r\n?/g, "\n");
    const flags = new Map(saved?.numberFlags || []);
    commit({ text, rows: recipientMarkTokens(text).map((row, index) => ({ ...row, source: flags.get(index + 1) === 2 ? "edited" : flags.get(index + 1) === 1 ? "manual" : saved?.hasPasted ? "pasted" : "unknown" })), sourceMemory: Array.isArray(saved?.sourceMemory) ? saved.sourceMemory : [], activity: restoreRecipientActivity(saved, text) });
  }
  function appendFile(content) {
    const before = current.current;
    const text = (before.text ? before.text + "\n" + content : content).replace(/\r\n?/g, "\n");
    commit({ ...updateRecipientMarks(before, text, "imported", {start:before.text.length,end:before.text.length}), activity: recordRecipientChange(before.activity, text, false) });
  }
  const audit = useMemo(() => ({ ...state.activity, numberFlags: recipientNumberFlags(state.rows) }), [state.activity, state.rows]);
  const tracking = useMemo(() => ({ ...audit, sourceMemory: state.sourceMemory }), [audit, state.sourceMemory]);
  return { rawRecipients: state.text, change, restore, tracking, audit, onPaste, appendFile,
    onBeforeInput: event => { if (!pastePending.current) selection.current = {start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd}; },
  };
}
