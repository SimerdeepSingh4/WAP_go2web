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

// Preset colour pairs (visx defaults). All props pass through to
// `<LinearGradient {...props} />`.

export function GradientDarkgreenGreen({
  from = "#184E86",
  to = "#57CA85",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientLightgreenGreen({
  from = "#42E695",
  to = "#3BB2B8",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientOrangeRed({
  from = "#FCE38A",
  to = "#F38181",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPinkBlue({
  from = "#F02FC2",
  to = "#6094EA",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPinkRed({
  from = "#F54EA2",
  to = "#FF7676",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPurpleOrange({
  from = "#7117EA",
  to = "#EA6060",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientPurpleTeal({
  from = "#5B247A",
  to = "#1BCEDF",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientSteelPurple({
  from = "#65799B",
  to = "#5E2563",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}

export function GradientTealBlue({
  from = "#17EAD9",
  to = "#6078EA",
  ...restProps
}) {
  return <LinearGradient from={from} to={to} {...restProps} />;
}
