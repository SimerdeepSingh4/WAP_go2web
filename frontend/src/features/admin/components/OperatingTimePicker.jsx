export default function OperatingTimePicker({ id, label, value, onChange, invalid = false }) {
  return <div className="portal-field"><label htmlFor={id}>{label}</label><input id={id} type="time" value={value} onChange={event => onChange(event.target.value)} aria-invalid={invalid} required /></div>;
}
