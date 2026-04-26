import { useEffect, useRef } from "react";

/**
 * Fire `effect` exactly once across the lifetime of the calling component
 * mount. The first-render closure is captured in a ref so the effect runs
 * even if callers pass an inline function whose identity changes every
 * render — without us mutating refs during the render phase.
 */
export function useFireOnce(effect: () => void) {
  const initialEffectRef = useRef(effect);
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    initialEffectRef.current();
  }, []);
}
