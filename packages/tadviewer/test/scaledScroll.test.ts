import {
  isScaled,
  maxPhysicalOffset,
  maxVirtualOffset,
  offsetToReveal,
  physicalHeight,
  scrollRatio,
  toPhysical,
  toVirtual,
  wheelDeltaPixels,
} from "../src/components/scaledScroll";

const ROW_HEIGHT = 28;
const VIEWPORT = 700;

const geometry = (rows: number) => ({
  contentHeight: rows * ROW_HEIGHT,
  viewportHeight: VIEWPORT,
});

describe("scaledScroll", () => {
  test("content that fits maps 1:1", () => {
    const g = geometry(100_000);
    expect(isScaled(g)).toBe(false);
    expect(scrollRatio(g)).toBe(1);
    expect(physicalHeight(g)).toBe(100_000 * ROW_HEIGHT);
    expect(toPhysical(g, 12_345)).toBe(12_345);
    expect(toVirtual(g, 12_345)).toBe(12_345);
  });

  test("10M rows scale into the capped physical height", () => {
    const g = geometry(10_000_000);
    expect(isScaled(g)).toBe(true);
    expect(physicalHeight(g)).toBe(10_000_000);
    expect(scrollRatio(g)).toBeCloseTo(
      (10_000_000 * ROW_HEIGHT - VIEWPORT) / (10_000_000 - VIEWPORT)
    );
    // The ends of the physical range map to the ends of the virtual range:
    expect(toVirtual(g, 0)).toBe(0);
    expect(toVirtual(g, maxPhysicalOffset(g))).toBeCloseTo(maxVirtualOffset(g));
    expect(toPhysical(g, maxVirtualOffset(g))).toBeCloseTo(maxPhysicalOffset(g));
    // Round trip:
    const y = 123_456_789;
    expect(toVirtual(g, toPhysical(g, y))).toBeCloseTo(y);
  });

  test("the last row is reachable", () => {
    const rows = 10_000_000;
    const g = geometry(rows);
    const lastRowBottom = rows * ROW_HEIGHT;
    expect(maxVirtualOffset(g) + VIEWPORT).toBe(lastRowBottom);
  });

  test("offsets are clamped", () => {
    const g = geometry(10_000_000);
    expect(toVirtual(g, -50)).toBe(0);
    expect(toVirtual(g, 1e12)).toBe(maxVirtualOffset(g));
    expect(toPhysical(g, 1e15)).toBeCloseTo(maxPhysicalOffset(g));
  });

  test("tiny tables don't scroll", () => {
    const g = geometry(5);
    expect(maxVirtualOffset(g)).toBe(0);
    expect(scrollRatio(g)).toBe(1);
    expect(toVirtual(g, 100)).toBe(0);
  });

  test("offsetToReveal scrolls the minimum distance", () => {
    const g = geometry(1000);
    // already visible:
    expect(offsetToReveal(g, 280, 280, 308)).toBe(280);
    expect(offsetToReveal(g, 280, 952, 980)).toBe(280);
    // above:
    expect(offsetToReveal(g, 280, 252, 280)).toBe(252);
    // below: bottom aligned with the viewport's bottom
    expect(offsetToReveal(g, 280, 980, 1008)).toBe(1008 - VIEWPORT);
  });

  test("wheel deltas in lines and pages", () => {
    expect(wheelDeltaPixels(3, 0, ROW_HEIGHT, VIEWPORT)).toBe(3);
    expect(wheelDeltaPixels(3, 1, ROW_HEIGHT, VIEWPORT)).toBe(3 * ROW_HEIGHT);
    expect(wheelDeltaPixels(-1, 2, ROW_HEIGHT, VIEWPORT)).toBe(-VIEWPORT);
  });
});
