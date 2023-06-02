/**
 * A set of utility functions from [d3-array](https://github.com/d3/d3-array/tree/main),
 *
 * put here because of ESM / CommonJS module incompatibilities
 */
const e10 = Math.sqrt(50),
  e5 = Math.sqrt(10),
  e2 = Math.sqrt(2);

function tickSpec(
  start: number,
  stop: number,
  count: number
): [number, number, number] {
  const step = (stop - start) / Math.max(0, count),
    power = Math.floor(Math.log10(step)),
    error = step / Math.pow(10, power),
    factor = error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1;
  let i1, i2, inc;
  if (power < 0) {
    inc = Math.pow(10, -power) / factor;
    i1 = Math.round(start * inc);
    i2 = Math.round(stop * inc);
    if (i1 / inc < start) ++i1;
    if (i2 / inc > stop) --i2;
    inc = -inc;
  } else {
    inc = Math.pow(10, power) * factor;
    i1 = Math.round(start / inc);
    i2 = Math.round(stop / inc);
    if (i1 * inc < start) ++i1;
    if (i2 * inc > stop) --i2;
  }
  if (i2 < i1 && 0.5 <= count && count < 2)
    return tickSpec(start, stop, count * 2);
  return [i1, i2, inc];
}

function tickIncrement(start: number, stop: number, count: number): number {
  (stop = +stop), (start = +start), (count = +count);
  return tickSpec(start, stop, count)[2];
}
export function nice(
  start: number,
  stop: number,
  count: number
): [number, number] {
  let prestep;
  while (true) {
    const step = tickIncrement(start, stop, count);
    if (step === prestep || step === 0 || !isFinite(step)) {
      return [start, stop];
    } else if (step > 0) {
      start = Math.floor(start / step) * step;
      stop = Math.ceil(stop / step) * step;
    } else if (step < 0) {
      start = Math.ceil(start * step) / step;
      stop = Math.floor(stop * step) / step;
    }
    prestep = step;
  }
}

// Adapted from https://github.com/d3/d3-array/blob/main/src/threshold/sturges.js
export function thresholdSturges(valuesCount: number) {
  return Math.max(1, Math.ceil(Math.log(valuesCount) / Math.LN2) + 1);
}
