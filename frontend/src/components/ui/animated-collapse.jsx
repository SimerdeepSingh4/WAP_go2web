import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";

function CollapseContent({ children, className, ...props }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();

  return (
    <motion.div
      {...props}
      data-slot="animated-collapse"
      inert={!present ? true : undefined}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: "easeInOut" }}
      className="min-w-0 overflow-hidden"
    >
      <div className={className}>{children}</div>
    </motion.div>
  );
}

// Keep content mounted through its exit so following elements move with it.
// Put padding/borders inside so they collapse along with the content height.
export function AnimatedCollapse({ open, children, ...props }) {
  return (
    <AnimatePresence initial={false}>
      {open && <CollapseContent key="content" {...props}>{children}</CollapseContent>}
    </AnimatePresence>
  );
}
