/* @flow */

import * as Immutable from 'immutable'
import * as reltab from './reltab'

/*
 * State needed for a scollable view of a reltab query
 */
export default class QueryView extends Immutable.Record({
  query: null,
  rowCount: 0,
  // The following fields are just for auxiliary info in footer
  baseRowCount: 0,
  filterRowCount: 0
}) {
  query: reltab.QueryExp
  rowCount: number
  baseRowCount: number
  filterRowCount: number
}
