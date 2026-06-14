/** Capped device pixel ratio for crisp canvas rendering without excess GPU cost. */
export function getDisplayDpi(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}
