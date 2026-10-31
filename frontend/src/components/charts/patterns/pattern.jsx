export function Pattern(
  {
    id,
    width,
    height,
    children
  }
) {
  return (
    <defs>
      <pattern
        height={height}
        id={id}
        patternUnits="userSpaceOnUse"
        width={width}
      >
        {children}
      </pattern>
    </defs>
  );
}
