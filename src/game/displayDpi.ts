/** Capped device pixel ratio for crisp canvas rendering without excess GPU cost.
 * Divides out browser page-zoom so the WebGL buffer stays stable when the user
 * zooms the page — only the camera reframes, not the room layout. */
export function getDisplayDpi(): number {
  const dpr = window.devicePixelRatio || 1;
  const pageZoom = window.visualViewport?.scale ?? 1;
  return Math.min(dpr / pageZoom, 2);
}
