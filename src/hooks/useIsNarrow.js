import { useState, useEffect } from "react";

/**
 * Breakpoint base del proyecto. 700px es el corte entre "escritorio" y
 * "pantalla angosta"; para el rango iPhone (375-430px) se pasa 430 a mano.
 */
export const NARROW_BREAKPOINT = 700;

/**
 * Devuelve true cuando la pantalla es más angosta que `maxWidth`.
 *
 * La app está estilada con objetos style inline, y los estilos inline le ganan
 * en especificidad a cualquier media query. Por eso el responsive por vista se
 * resuelve ramificando los objetos style con este hook, y el CSS de index.css
 * queda solo para lo estructural (shell, canvas, drawer).
 */
export default function useIsNarrow(maxWidth = NARROW_BREAKPOINT) {
  const query = `(max-width: ${maxWidth}px)`;

  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const mql = window.matchMedia(query);
    const onChange = e => setIsNarrow(e.matches);

    setIsNarrow(mql.matches);

    // Safari < 14 no tiene addEventListener sobre MediaQueryList
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return isNarrow;
}
