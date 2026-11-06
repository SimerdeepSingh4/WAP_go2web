export const emptyRecipientActivity = () => ({ hasPasted: false, pasteCount: 0, wasModifiedAfterPaste: false, suspiciousOverwrite: false, finalTextLength: 0 });

export function recordRecipientPaste(activity) {
  return { ...activity, hasPasted: true, pasteCount: activity.pasteCount + 1,
    suspiciousOverwrite: activity.suspiciousOverwrite || activity.hasPasted && activity.wasModifiedAfterPaste };
}

export function recordRecipientChange(activity, text, manual = true, changed = true) {
  return { ...activity, finalTextLength: text.length,
    wasModifiedAfterPaste: activity.wasModifiedAfterPaste || manual && changed && activity.hasPasted };
}

export function restoreRecipientActivity(saved, text) {
  const hasPasted = saved?.hasPasted === true;
  return { hasPasted, pasteCount: hasPasted ? Math.max(1, Number.isSafeInteger(saved?.pasteCount) ? saved.pasteCount : 1) : 0,
    wasModifiedAfterPaste: hasPasted && (saved?.wasModifiedAfterPaste === true || saved?.modificationsDetected === true || saved?.spans?.some(span => span.source === "manual") === true),
    suspiciousOverwrite: hasPasted && saved?.suspiciousOverwrite === true, finalTextLength: text.length };
}
