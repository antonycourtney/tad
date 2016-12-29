/* @flow */

import * as Immutable from 'immutable'
import ViewParams from './ViewParams'
import SimpleDataView from './SimpleDataView'
import Timer from './Timer'

/**
 * Immutable representation of all state associated
 * with a single view.
 *
 * Consists of user-editable ViewParams plus any associated
 * query / network / render state
 */
export default class ViewState extends Immutable.Record({
  viewParams: new ViewParams(),
  loadingTimer: new Timer(),
  scrolling: false,
  scrollingStart: 0,
  scrollingElapsed: 0,
  scrollingTimerId: 0,
  scrollFrom: 0,
  scrollTo: 0,
  dataView: null
}) {
  viewParams: ViewParams
  loadingTimer: Timer
  dataView: ?SimpleDataView
}
