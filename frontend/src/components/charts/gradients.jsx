export function LinearGradient(
  {
    children,
    id,
    from,
    to,
    x1: x1Prop,
    y1: y1Prop,
    x2: x2Prop,
    y2: y2Prop,
    fromOffset = "0%",
    fromOpacity = 1,
    toOffset = "100%",
    toOpacity = 1,
    rotate,
    transform,
    vertical = true,
    ...restProps
  }
) {
  let x1 = x1Prop;
  let x2 = x2Prop;
  let y1 = y1Prop;
  let y2 = y2Prop;
  if (vertical && !x1 && !x2 && !y1 && !y2) {
    x1 = "0";
    x2 = "0";
    y1 = "0";
    y2 = "1";
  }
  // An object, not JSX attributes, so the formatter keeps visx's order.
  const props = {
    id,
    x1,
    y1,
    x2,
    y2,
    gradientTransform: rotate ? `rotate(${rotate})` : transform,
    ...restProps,
  };
  return (
    <defs>
      <linearGradient {...props}>
        {!!children && children}
        {!children && (
          <stop
            offset={fromOffset}
            stopColor={from}
            stopOpacity={fromOpacity}
          />
        )}
        {!children && (
          <stop offset={toOffset} stopColor={to} stopOpacity={toOpacity} />
        )}
      </linearGradient>
    </defs>
  );
}

export function RadialGradient({
  children,
  id,
  from,
  to,
  fromOffset = "0%",
  fromOpacity = 1,
  toOffset = "100%",
  toOpacity = 1,
  rotate,
  transform,
  ...restProps
}) {
  const props = {
    id,
    gradientTransform: rotate ? `rotate(${rotate})` : transform,
    ...restProps,
  };
  return (
    <defs>
      <radialGradient {...props}>
        {!!children && children}
        {!children && (
          <stop
            offset={fromOffset}
            stopColor={from}
            stopOpacity={fromOpacity}
          />
        )}
        {!children && (
          <stop offset={toOffset} stopColor={to} stopOpacity={toOpacity} />
        )}
      </radialGradient>
    </defs>
  );
}

// Morning dew gradient presets. All props pass through to
// `<LinearGradient {...props} />`.

export function GradientDarkgreenGreen({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientLightgreenGreen({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientOrangeRed({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPinkBlue({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPinkRed({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPurpleOrange({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPurpleTeal({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientSteelPurple({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientTealBlue({
  from = "var(--palette-teal)",
  to = "var(--palette-mint)",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}
