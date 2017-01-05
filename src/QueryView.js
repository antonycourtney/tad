/* @flow */

import * as Immutable from 'immutable'
import * as reltab from './reltab'

/*
 * State needed for a scollable view of a reltab query
 */
export default class QueryView extends Immutable.Record({
  query: null,
  rowCount: 0
}) {
  query: reltab.QueryExp
  rowCount: number
}
