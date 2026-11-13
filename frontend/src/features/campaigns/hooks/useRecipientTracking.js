import { useCallback, useMemo, useRef, useState } from "react";
import { emptyRecipientActivity, recordRecipientPaste, recordRecipientChange, restoreRecipientActivity, updateRecipientMarks, recipientMarkTokens, recipientNumberFlags } from "../lib/recipientInputAudit";
import { recipientEditError } from "../lib/submission";

export default function useRecipientTracking() {
  const [state, setState] = useState(() => ({ text: "", rows: [], sourceMemory: [], activity: emptyRecipientActivity() }));
  const current = useRef(state);
  const pastePending = useRef(false);
  const selection = useRef(null);
  const [inputError, setInputError] = useState(null);
  const errorTimeout = useRef(null);

  const showInputError = useCallback((err) => {
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    setInputError(err);
    if (err) {
      errorTimeout.current = setTimeout(() => {
        setInputError(null);
      }, 2500);
    }
  }, []);

  const clearInputError = useCallback(() => {
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    setInputError(null);
  }, []);

  const commit = useCallback(next => { current.current = next; setState(next); }, []);

  function change(text) {
    text = text.replace(/\r\n?/g, "\n");
    // Clear any transient typing error when text changes
    clearInputError();
    const before = current.current;
    commit({
      ...updateRecipientMarks(before, text, pastePending.current ? "pasted" : "manual", selection.current),
      activity: recordRecipientChange(before.activity, text, !pastePending.current, text !== before.text)
    });
    selection.current = null;
    pastePending.current = false;
    return true;
  }

  function onPaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\r\n?/g, "\n");
    if (!pasted) return;
    // Never block paste — allow entire list to be pasted smoothly; validation counters below will highlight invalid lines
    clearInputError();
    pastePending.current = true;
    selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    commit({ ...current.current, activity: recordRecipientPaste(current.current.activity) });
    setTimeout(() => { pastePending.current = false; }, 100);
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
    if (error) {
      showInputError(error);
      return false;
    }
    clearInputError();
    commit({ ...updateRecipientMarks(before, text, "imported", {start:before.text.length,end:before.text.length}), activity: recordRecipientChange(before.activity, text, false) });
    return true;
  }

  const audit = useMemo(() => ({ ...state.activity, numberFlags: recipientNumberFlags(state.rows) }), [state.activity, state.rows]);
  const tracking = useMemo(() => ({ ...audit, sourceMemory: state.sourceMemory }), [audit, state.sourceMemory]);

  return {
    rawRecipients: state.text,
    change,
    restore,
    tracking,
    audit,
    onPaste,
    appendFile,
    inputError,
    clearInputError,
    onBeforeInput: event => {
      // Never interfere with paste operations
      if (pastePending.current || event.inputType === "insertFromPaste") return;

      const data = event.data ?? event.nativeEvent?.data;
      const input = event.currentTarget;

      if (typeof data === "string" && data !== "\n" && data !== "\r") {
        // 1. Strictly block any alphabet or non-digit character from entering
        if (/[^0-9]/.test(data)) {
          const lineNum = input.value.slice(0, input.selectionStart).split("\n").length;
          showInputError({ lineNumber: lineNum, message: "Only digits are allowed, with one number per line." });
          event.preventDefault();
          return;
        }

        // 2. Strictly block 13th digit on the current line (max 12 digits per row)
        const before = input.value.slice(0, input.selectionStart);
        const after = input.value.slice(input.selectionEnd);
        const linesBefore = before.split("\n");
        const currentLineBefore = linesBefore[linesBefore.length - 1];
        const linesAfter = after.split("\n");
        const currentLineAfter = linesAfter[0];
        const proposedCurrentLine = currentLineBefore + data + currentLineAfter;

        if (proposedCurrentLine.length > 12) {
          showInputError({ lineNumber: linesBefore.length, message: "A number cannot contain more than 12 digits." });
          event.preventDefault();
          return;
        }
      }

      if (!pastePending.current) {
        selection.current = { start: input.selectionStart, end: input.selectionEnd };
      }
    },
  };
}
