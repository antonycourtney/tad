/* @flow */

import * as Immutable from 'immutable'

/**
 * A timer object for use in OneRef-based immutable state
 *
 */

export type TimerUpdater = (f: (ts: Timer) => Timer) => void

export default class Timer extends Immutable.Record({
  running: false,   // true iff timer is running
  start: 0,
  elapsed: 0,     // in ms
  timerId: 0
}) {
  running: boolean
  start: number
  elapsed: number
  timerId: number

  /*
   * Ensure that the timer is running.
   * Will start the timer if not currently running, NOP otherwise
   */
  run (interval: number, updater: TimerUpdater) : Timer {
    if (this.running) {
      return this
    }
    const startTime = (new Date()).getTime()
    const timerId = window.setInterval(() => this.onTick(updater), interval)
    return (this
      .set('running', true)
      .set('start', startTime)
      .set('elapsed', 0)
      .set('timerId', timerId))
  }

  /*
   * Stop the timer (by cancelling it)
   * A NOP if timer not running
   */
  stop (): Timer {
    if (!this.running) {
      return this
    }
    window.clearInterval(this.timerId)
    return (this
      .remove('running')
      .remove('start')
      .remove('elapsed')
      .remove('timerId'))
  }

  onTick (updater: TimerUpdater) {
    updater(ts => {
      if (!ts.running) {
        return ts // possible if tick event was in-flight while cancelled
      }
      const curTime = (new Date()).getTime()
      const elapsed = curTime - ts.start
      return (ts.set('elapsed', elapsed))
    })
  }
}
