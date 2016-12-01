/* @flow */

import * as Immutable from 'immutable'
import * as reltab from './reltab'

/**
 * Immutable representation of application state for use with OneRef
 *
 */
export default class AppState extends Immutable.Record({
  windowTitle: '',
  rtc: null,
  baseQuery: null,
  baseSchema: null,
  showRoot: true,
  displayColumns: [],
  vpivots: [],
  sortKey: []
}) {
  // duplicated here to allow us to write flow types:
  windowTitle: string     // Usually just the table name or file name
  rtc : reltab.Connection
  baseQuery: reltab.QueryExp
  baseSchema: reltab.Schema   // always in sync with baseQuery
  showRoot: boolean
  displayColumns: Array<string> // array of column ids to display, in order
  vpivots: Array<string>  // array of columns to pivot
  sortKey: Array<[string, boolean]>
}
