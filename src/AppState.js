/* @flow */

import * as Immutable from 'immutable'
import ViewState from './ViewState'
import * as reltab from './reltab'

/**
 * Immutable representation of application state
 *
 * Just a single view in a single untabbed window for now.
 */
export default class AppState extends Immutable.Record({
  initialized: false,
  windowTitle: '',
  rtc: null,
  targetPath: '', // path to CSV file
  baseQuery: null,
  baseSchema: null,
  viewState: new ViewState()
}) {
  // duplicated here to allow us to write flow types:
  initialized: boolean    // Has main process initialization completed?
  windowTitle: string     // Usually just the table name or file name
  rtc : reltab.Connection
  targetPath: string
  baseQuery: reltab.QueryExp
  baseSchema: reltab.Schema   // always in sync with baseQuery
  viewState: ViewState
}
