/* @flow */

/**
 * All calculations needed for lazy loading pages of data
 *
 */

export const PAGESIZE = 1024

export const pageNum = (rowNum: number) => Math.floor(rowNum / PAGESIZE)

export const pageStart = (pageNum: number) => pageNum * PAGESIZE

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
