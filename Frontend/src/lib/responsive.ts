import { useEffect, useState } from "react";

export const COMPACT_MAX = 1023;
export const MOBILE_MAX = 599;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Below this, the sidebar becomes a drawer and chrome reflows. */
export function useIsCompact(): boolean {
  return useMediaQuery(`(max-width: ${COMPACT_MAX}px)`);
}

/** Phone-width — icon-only header, stacked fields, chip rows. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
}
