import "./recipient-number-highlight.css";

export function recipientMarkMap(activity) {
  if (activity?.numberFlags) return new Map(activity.numberFlags);
  return new Map((activity?.rows || []).flatMap(row => row.source === "edited" ? [[row.position, 2]] : row.source === "manual" ? [[row.position, 1]] : []));
}

export default function RecipientNumberHighlight({ mark }) {
  if (mark !== 1 && mark !== 2) return null;
  return <span className="recipient-number-marker" data-input-risk={mark} title={mark === 2 ? "This number was edited after paste or import. The marker is retained if the edited number is pasted again." : "This number was manually entered."}>{mark === 2 ? "Edited input" : "Manual input"}</span>;
}
