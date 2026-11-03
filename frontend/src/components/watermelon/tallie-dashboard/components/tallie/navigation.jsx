import { createContext, useContext, useMemo, useState } from "react";

const DashboardNavigationContext = createContext(null);

export function DashboardNavigationProvider({ children }) {
  const [pathname, setPathname] = useState("/");
  const value = useMemo(
    () => ({ pathname, navigate: setPathname }),
    [pathname],
  );

  return (
    <DashboardNavigationContext.Provider value={value}>
      {children}
    </DashboardNavigationContext.Provider>
  );
}

export function useDashboardNavigation() {
  const context = useContext(DashboardNavigationContext);

  if (!context) {
    throw new Error(
      "useDashboardNavigation must be used within DashboardNavigationProvider",
    );
  }

  return context;
}

export function DashboardLink({ href, onClick, ...props }) {
  const { navigate } = useDashboardNavigation();

  function handleClick(event) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(href);
  }

  return <a href={href} onClick={handleClick} {...props} />;
}

