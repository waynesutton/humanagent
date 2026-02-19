import { useCallback, useEffect } from "react";

// Close handler triggered on Escape key press when active is true
export function useEscapeKey(handler: () => void, active: boolean) {
  const stableHandler = useCallback(handler, [handler]);
  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        stableHandler();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, stableHandler]);
}
