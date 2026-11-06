import { useRef, useState } from "react";
import { emptyRecipientActivity, recordRecipientPaste, recordRecipientChange, restoreRecipientActivity } from "../lib/recipientInputAudit";

export default function useRecipientTracking() {
  const [state, setState] = useState(() => ({ text: "", activity: emptyRecipientActivity() }));
  const current = useRef(state);
  const pastePending = useRef(false);
  function commit(next) { current.current = next; setState(next); }
  function change(text) {
    text = text.replace(/\r\n?/g, "\n");
    const before = current.current;
    commit({ text, activity: recordRecipientChange(before.activity, text, !pastePending.current, text !== before.text) });
    pastePending.current = false;
  }
  function onPaste(event) {
    if (!event.clipboardData.getData("text")) return;
    pastePending.current = true;
    commit({ ...current.current, activity: recordRecipientPaste(current.current.activity) });
    // A canceled or no-op paste must not suppress a later manual input.
    setTimeout(() => { pastePending.current = false; }, 0);
  }
  function restore(text, saved) {
    text = text.replace(/\r\n?/g, "\n");
    commit({ text, activity: restoreRecipientActivity(saved, text) });
  }
  function appendFile(content) {
    const before = current.current;
    const text = (before.text ? before.text + "\n" + content : content).replace(/\r\n?/g, "\n");
    commit({ text, activity: recordRecipientChange(before.activity, text, false) });
  }
  return { rawRecipients: state.text, change, restore, tracking: state.activity, audit: state.activity, onPaste, appendFile };
}
