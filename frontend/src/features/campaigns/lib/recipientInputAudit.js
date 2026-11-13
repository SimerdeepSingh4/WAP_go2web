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

export function recipientMarkTokens(text) {
  const rows = [];
  for (const chunk of text.matchAll(/[^\r\n]+/g)) {
    if (chunk[0].trim()) rows.push({ value: chunk[0], start: chunk.index, end: chunk.index + chunk[0].length });
  }
  return rows;
}

// Retain only current row classifications and a compact lookup of previously
// touched numbers. No past text snapshots or keystroke history are collected.
export function updateRecipientMarks(before, text, mode = "manual", selection) {
  let start = 0, end = before.text.length, nextEnd = text.length;
  const insertedLength = selection && text.length - before.text.length + selection.end - selection.start;
  if (selection && insertedLength >= 0 && text === before.text.slice(0, selection.start) + text.slice(selection.start, selection.start + insertedLength) + before.text.slice(selection.end)) {
    start = selection.start; end = selection.end; nextEnd = start + insertedLength;
  } else {
    while (start < end && start < nextEnd && before.text[start] === text[start]) start++;
    while (end > start && nextEnd > start && before.text[end - 1] === text[nextEnd - 1]) { end--; nextEnd--; }
  }
  const delta = nextEnd - end;
  const byStart = new Map(before.rows.map(row => [row.start, row]));
  const touched = before.rows.filter(row => row.start < end && row.end > start || start === end && row.start <= start && row.end >= start);
  const known = new Map(before.sourceMemory || []);
  const rows = recipientMarkTokens(text).map(row => {
    const oldStart = row.end <= start ? row.start : row.start >= nextEnd ? row.start - delta : null;
    const same = oldStart !== null && byStart.get(oldStart);
    let source;
    if (same && same.value === row.value) source = same.source;
    else if (mode !== "manual") source = known.get(row.value.replace(/\D/g, "")) || mode;
    else source = touched.some(old => ["pasted", "imported", "edited"].includes(old.source) && row.start <= start && row.end >= nextEnd) ? "edited" : "manual";
    const key = row.value.replace(/\D/g, "");
    if (["manual", "edited"].includes(source) && /^\d{10,15}$/.test(key)) known.set(key, source === "edited" || known.get(key) === "edited" ? "edited" : "manual");
    return { ...row, source };
  });
  return { text, rows, sourceMemory: [...known] };
}

export const recipientNumberFlags = rows => rows.flatMap((row, index) => row.source === "manual" ? [[index + 1, 1]] : row.source === "edited" ? [[index + 1, 2]] : []);
