/**
 * Vertical scroll mapping for grids taller than the browser allows.
 *
 * Browsers cap the height of an element (about 33.5M CSS pixels in Chrome,
 * 17.9M in Firefox), so a scroll container can't have one pixel of height
 * per pixel of rows once a table has more than about a million rows.
 *
 * We keep two scroll positions:
 * - the *virtual* offset: where we are in the full table
 *   (row index * row height), which decides which rows to render;
 * - the *physical* offset: the scroll container's scrollTop, over a
 *   content height capped at MAX_PHYSICAL_HEIGHT.
 *
 * When the table fits, the two are the same. Otherwise the physical range
 * is a scaled-down copy of the virtual range: dragging the scrollbar maps
 * proportionally, while wheel and keyboard scrolling move the virtual
 * offset 1:1 and set scrollTop from it (see DomDataGrid).
 */

// Well under every browser's limit:
export const MAX_PHYSICAL_HEIGHT = 10_000_000;

export interface ScrollGeometry {
  /** Height of all rows: rowCount * rowHeight. */
  contentHeight: number;
  /** Height of the visible area that the rows scroll in. */
  viewportHeight: number;
  /** Cap on the scroll container's content height (for tests). */
  maxPhysicalHeight?: number;
}

const maxOffset = (height: number, viewportHeight: number): number =>
  Math.max(0, height - viewportHeight);

/** Height to give the scroll container's content. */
export const physicalHeight = (g: ScrollGeometry): number =>
  Math.min(g.contentHeight, g.maxPhysicalHeight ?? MAX_PHYSICAL_HEIGHT);

export const maxVirtualOffset = (g: ScrollGeometry): number =>
  maxOffset(g.contentHeight, g.viewportHeight);

export const maxPhysicalOffset = (g: ScrollGeometry): number =>
  maxOffset(physicalHeight(g), g.viewportHeight);

/** Virtual pixels per physical pixel; 1 when the content fits. */
export const scrollRatio = (g: ScrollGeometry): number => {
  const vMax = maxVirtualOffset(g);
  const pMax = maxPhysicalOffset(g);
  return pMax > 0 && vMax > pMax ? vMax / pMax : 1;
};

export const isScaled = (g: ScrollGeometry): boolean => scrollRatio(g) > 1;

export const clampVirtual = (g: ScrollGeometry, virtualY: number): number =>
  Math.max(0, Math.min(virtualY, maxVirtualOffset(g)));

/** scrollTop that corresponds to a virtual offset. */
export const toPhysical = (g: ScrollGeometry, virtualY: number): number =>
  clampVirtual(g, virtualY) / scrollRatio(g);

/** Virtual offset that corresponds to a scrollTop. */
export const toVirtual = (g: ScrollGeometry, physicalY: number): number =>
  clampVirtual(g, physicalY * scrollRatio(g));

/** Wheel event delta in pixels (deltaMode may be lines or pages). */
export const wheelDeltaPixels = (
  delta: number,
  deltaMode: number,
  lineHeight: number,
  pageHeight: number
): number => {
  switch (deltaMode) {
    case 1: // WheelEvent.DOM_DELTA_LINE
      return delta * lineHeight;
    case 2: // WheelEvent.DOM_DELTA_PAGE
      return delta * pageHeight;
    default:
      return delta;
  }
};

/**
 * Virtual offset that scrolls the minimum distance needed to show the
 * span [top, bottom) (e.g. a row), or the current offset if it's visible.
 */
export const offsetToReveal = (
  g: ScrollGeometry,
  currentY: number,
  top: number,
  bottom: number
): number => {
  if (top < currentY) {
    return clampVirtual(g, top);
  }
  if (bottom > currentY + g.viewportHeight) {
    return clampVirtual(g, bottom - g.viewportHeight);
  }
  return currentY;
};
