/* @flow */

import * as Immutable from 'immutable'
import ViewParams from './ViewParams'
import QueryView from './QueryView'
import PagedDataView from './PagedDataView'
import Timer from './Timer'

/**
 * Immutable representation of all state associated
 * with a single view.
 *
 * Consists of user-editable ViewParams plus any associated
 * query / network / render state
 */
export default class ViewState extends Immutable.Record({
  viewParams: undefined,
  loadingTimer: new Timer(),
  viewportTop: 0,
  viewportBottom: 0,
  queryView: null,
  dataView: null
}) {
  viewParams: ViewParams
  loadingTimer: Timer
  viewportTop: number
  viewportBottom: number
  queryView: ?QueryView
  dataView: ?PagedDataView
}
