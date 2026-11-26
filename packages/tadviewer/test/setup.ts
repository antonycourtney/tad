// Some modules (e.g. TextFormatOptions) refer to `window` when loaded; the
// tests run in Node, so provide one.
(globalThis as any).window = globalThis;
