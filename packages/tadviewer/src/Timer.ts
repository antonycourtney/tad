import * as Immutable from "immutable";
/**
 * A timer object for use in OneRef-based immutable state
 *
 */

export type TimerUpdater = (f: (ts: Timer) => Timer) => void; // eslint-disable-line

export interface TimerProps {
  running: boolean;
  start: number;
  elapsed: number;
  timerId: number;
}

const defaultTimerProps: TimerProps = {
  running: false,
  // true iff timer is running
  start: 0,
  elapsed: 0,
  // in ms
  timerId: 0
};

export class Timer extends Immutable.Record(defaultTimerProps)
  implements TimerProps {
  public readonly running!: boolean;
  public readonly start!: number;
  public readonly elapsed!: number;
  public readonly timerId!: number;
  /*
   * Ensure that the timer is running.
   * Will start the timer if not currently running, NOP otherwise
   */

  run(interval: number, updater: TimerUpdater): Timer {
    if (this.running) {
      return this;
    }

    const startTime = new Date().getTime();
    const timerId = window.setInterval(() => this.onTick(updater), interval);
    return this.set("running", true)
      .set("start", startTime)
      .set("elapsed", 0)
      .set("timerId", timerId) as Timer;
  }
  /*
   * Stop the timer (by cancelling it)
   * A NOP if timer not running
   */

  stop(): Timer {
    if (!this.running) {
      return this;
    }

    window.clearInterval(this.timerId);
    return this.remove("running")
      .remove("start")
      .remove("elapsed")
      .remove("timerId") as Timer;
  }

  onTick(updater: TimerUpdater) {
    updater(
      (ts: Timer): Timer => {
        if (!ts.running) {
          return ts; // possible if tick event was in-flight while cancelled
        }

        const curTime = new Date().getTime();
        const elapsed = curTime - ts.start;
        return ts.set("elapsed", elapsed) as Timer;
      }
    );
  }
}
