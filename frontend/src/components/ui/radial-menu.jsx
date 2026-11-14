import { useCallback, useEffect, useRef, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { AnimatePresence, motion, useReducedMotion, useSpring, useMotionValueEvent } from "motion/react";
import { cn } from "cn";
import { radialSlicePath, polarToCartesian, radialIndexAtPoint } from "./radial-menu.geometry.js";
import "./radial-menu.css";

const menuTransition = { type: "spring", stiffness: 320, damping: 32, mass: .8 };

// Uses the supplied radial menu's ring geometry and scale/fade animation.
// Right-click/long-press the supplied chat surface to open the menu at the pointer.
export function RadialMenu({ children, menuItems = [], size = 240, iconSize = 18, bandWidth = 50, innerGap = 8, outerGap = 8, outerRingWidth = 12, onSelect, disabled }) {
  const radius = size / 2;
  const outerRingInnerRadius = radius - outerRingWidth;
  const wedgeOuterRadius = outerRingInnerRadius - outerGap;
  const wedgeInnerRadius = wedgeOuterRadius - bandWidth;
  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;
  const centerRadius = Math.max(wedgeInnerRadius - innerGap, 0);
  const slice = 360 / menuItems.length;
  const itemRefs = useRef([]);
  const selected = useRef(false);
  const popup = useRef(null);
  const highlight = useRef(null);
  const rotationTarget = useRef(0);
  const lastActive = useRef(null);
  const [activeIndex, setActiveIndex] = useState(null);
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const highlightAngle = useSpring(0, { stiffness: 420, damping: 38, mass: .7 });
  // SVG coordinates give the highlight an explicit, fixed center at (0, 0).
  useMotionValueEvent(highlightAngle, "change", angle => {
    highlight.current?.setAttribute("transform", `rotate(${angle} 0 0)`);
  });

  const activate = useCallback((index, focus = false) => {
    if (lastActive.current === index) return;
    lastActive.current = index;
    setActiveIndex(index);
    if (index === null) return;
    const target = index * slice;
    const delta = ((target - rotationTarget.current + 180) % 360 + 360) % 360 - 180;
    rotationTarget.current += delta;
    if (reducedMotion) highlightAngle.jump(rotationTarget.current);
    else highlightAngle.set(rotationTarget.current);
    if (focus) itemRefs.current[index]?.focus({ preventScroll: true });
  }, [slice, reducedMotion, highlightAngle]);

  useEffect(() => {
    if (!open) return;
    let frame = 0, point = null;
    const track = event => {
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bounds = popup.current?.getBoundingClientRect();
        if (!bounds || !point) return;
        const index = radialIndexAtPoint(point.x, point.y, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, menuItems.length, centerRadius * bounds.width / size);
        activate(index, true);
      });
    };
    window.addEventListener("pointermove", track, { passive: true, capture: true });
    return () => { window.removeEventListener("pointermove", track, true); if (frame) cancelAnimationFrame(frame); };
  }, [open, menuItems.length, centerRadius, size, activate]);

  function handleOpenChange(next) {
    if (next && disabled) return;
    setOpen(next);
    if (!next) { setActiveIndex(null); lastActive.current = null; }
    else selected.current = false;
  }
  function select(item) {
    if (selected.current) return;
    selected.current = true;
    handleOpenChange(false);
    onSelect?.(item);
  }
  return <ContextMenu.Root open={open} onOpenChange={handleOpenChange} modal={false}>
    <ContextMenu.Trigger render={children} />
    <AnimatePresence>
      {open && <ContextMenu.Portal keepMounted>
        <ContextMenu.Positioner align="center" sideOffset={({ positioner }) => -positioner.height / 2} collisionPadding={12} className="radial-menu-positioner">
          <ContextMenu.Popup ref={popup} aria-label="Choose a support problem" className="radial-menu-popup" style={{ width: size, height: size }}
            render={<motion.div initial={reducedMotion ? false : { opacity: 0, scale: .5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reducedMotion ? 1 : .5 }} transition={reducedMotion ? { duration: 0 } : menuTransition} />}>
            <svg className="radial-menu-svg" viewBox={`${-radius} ${-radius} ${size} ${size}`}>
              {menuItems.map((item, index) => <g key={`wedge-${item.id}`} className="radial-menu-segment" onClick={() => itemRefs.current[index]?.click()} onMouseEnter={() => activate(index, true)}>
                <path d={radialSlicePath(index, menuItems.length, radius, outerRingInnerRadius)} className="radial-menu-ring" />
                <path d={radialSlicePath(index, menuItems.length, wedgeOuterRadius, wedgeInnerRadius)} className="radial-menu-wedge" />
              </g>)}
              {activeIndex !== null && <g ref={highlight} className="radial-menu-highlight" transform={`rotate(${highlightAngle.get()} 0 0)`}>
                <path d={radialSlicePath(0, menuItems.length, radius, outerRingInnerRadius)} className="radial-menu-ring radial-menu-active" />
                <path d={radialSlicePath(0, menuItems.length, wedgeOuterRadius, wedgeInnerRadius)} className="radial-menu-wedge radial-menu-active" />
              </g>}
              {menuItems.map((item, index) => {
                const Icon = item.Icon || item.icon;
                const { x, y } = polarToCartesian(iconRingRadius, -90 + slice * index);
                const iconBox = iconSize * 2;
                const active = activeIndex === index;
                return <g key={item.id} className="radial-menu-segment"
                  onClick={event => { if (!event.target.closest('[role="menuitem"]')) itemRefs.current[index]?.click(); }}
                  onMouseEnter={() => activate(index, true)}>
                  <foreignObject x={x - iconBox / 2} y={y - iconBox / 2} width={iconBox} height={iconBox}>
                    <ContextMenu.Item ref={element => { itemRefs.current[index] = element; }} onFocus={() => activate(index)} onClick={() => select(item)} aria-label={item.label} title={item.label} className={cn("radial-menu-item", active && "radial-menu-active")}>
                      <Icon aria-hidden="true" style={{ width: iconSize, height: iconSize }} />
                    </ContextMenu.Item>
                  </foreignObject>
                </g>;
              })}
              <circle cx={0} cy={0} r={centerRadius} className="radial-menu-center" />
              <circle cx={0} cy={0} r={3} className="radial-menu-center-dot" style={{ opacity: activeIndex === null ? 1 : 0 }} />
              {activeIndex !== null && <foreignObject x={-centerRadius + 3} y={-centerRadius + 3} width={2 * (centerRadius - 3)} height={2 * (centerRadius - 3)} className="radial-menu-label-box"><div className="radial-menu-label" aria-hidden="true">{menuItems[activeIndex]?.label}</div></foreignObject>}
            </svg>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>}
    </AnimatePresence>
  </ContextMenu.Root>;
}

export { RadialMenu as Component };
