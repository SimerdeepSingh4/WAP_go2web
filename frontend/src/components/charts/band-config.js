import { Children, Fragment, isValidElement } from "react";
import { isChartClipPassthrough } from "./chart-child-passthrough";
import { normalizeYAxisId } from "./y-axis-scales";

/** Default `<Band>` colour (kept in sync with `Band`'s `fill` default). */
const DEFAULT_BAND_FILL = "var(--chart-line-primary)";

/** Default tooltip label: the key for a single-key band, else `lower – upper`. */
export function defaultBandLabel(upperKey, lowerKey) {
  return upperKey === lowerKey ? upperKey : `${lowerKey} – ${upperKey}`;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function bandConfigFromProps(props) {
  if (!(nonEmptyString(props?.upperKey) && nonEmptyString(props.lowerKey))) {
    return null;
  }
  return {
    yAxisId: normalizeYAxisId(props.yAxisId),
    upperKey: props.upperKey,
    lowerKey: props.lowerKey,
    color: nonEmptyString(props.fill) ? props.fill : DEFAULT_BAND_FILL,
    label: nonEmptyString(props.label)
      ? props.label
      : defaultBandLabel(props.upperKey, props.lowerKey),
    showInTooltip: props.showInTooltip !== false,
  };
}

function getChildComponentName(child) {
  const childType = child.type;
  return typeof child.type === "function"
    ? childType.displayName || childType.name || ""
    : "";
}

/** Collect `<Band>` props from chart children so band edges extend the y-domain. */
export function extractBandConfigs(children) {
  const configs = [];

  const visit = (node) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) {
        return;
      }

      if (child.type === Fragment) {
        visit((child.props).children);
        return;
      }

      if (getChildComponentName(child) === "Band") {
        const config = bandConfigFromProps(
          child.props
        );
        if (config) {
          configs.push(config);
        }
        return;
      }

      if (isChartClipPassthrough(child.type)) {
        visit((child.props).children);
        return;
      }

      const childProps = child.props;
      if (childProps?.children) {
        visit(childProps.children);
      }
    });
  };

  visit(children);
  return configs;
}

/** Band edge keys grouped by y-axis id (deduplicated, insertion order). */
export function bandKeysByAxis(configs) {
  const byAxis = {};
  for (const config of configs) {
    const keys = byAxis[config.yAxisId] ?? [];
    for (const key of [config.upperKey, config.lowerKey]) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
    byAxis[config.yAxisId] = keys;
  }
  return byAxis;
}
