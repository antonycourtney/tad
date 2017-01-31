/* @flow */

/**
 * All calculations needed for lazy loading pages of data
 *
 */

export const PAGESIZE = 1024

export const pageNum = (rowNum: number) => Math.floor(rowNum / PAGESIZE)

export const pageStart = (pageNum: number) => pageNum * PAGESIZE

/*
 * clamp the viewport top and bottom based on the total row count.
 * Tries to do the minimal adjustment necessary to the location
 * and size of the viewport to keep it within bounds; makes
 * no attempt to adjust to page boundaries or extend for
 * pre-fetching.
 */
export const clampViewport = (rowCount: number, inTop: number, inBottom: number): [number, number] => {
  const inSize = inBottom - inTop
  const outBottom = Math.min(rowCount, inBottom)
  const outTop = Math.max(0, outBottom - inSize)
/*
  if ((outTop !== inTop) || (outBottom !== inBottom)) {
    console.log('clamped viewport: [%d,%d] --> [%d,%d]', inTop, inBottom, outTop, outBottom)
  }
*/
  return [outTop, outBottom]
}

/*
 * calculate and return row offset and limit to obtain a viewport including
 * the specified top and bottom rows, aligned to page boundaries
 */
export const fetchParams = (top: number, bottom: number): [number, number] => {
  const startPage = pageNum(top)
  const endPage = pageNum(bottom)

  const offset = pageStart(startPage)
  const limit = (endPage - startPage + 1) * PAGESIZE
  return [offset, limit]
}

/*
 * returns true iff the interval [top,bottom] entirely contained in the specified
 * offset and limit
 */
export const contains = (offset: number, limit: number, top: number,
  bottom: number): boolean => ((top >= offset) && (bottom < (offset + limit)))
