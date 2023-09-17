/**
 *
 * A snapshot of the "environ" npm module from:
 * https://github.com/kjs3/environ/blob/master/src/index.ts
 *
 * Copied here because there are issues with the source map in the packaged
 * npm module; replace with the original module if/when this is fixed.
 */
declare const Deno: any;
declare const process: any;
declare const navigator: any;

export function isBrowser(): boolean {
  return hasWindow() && hasDocument();
}

// TODO: figure out how to test this
export function isWebWorker(): boolean {
  return false; // 🤷‍♂️
}

export function isNode(): boolean {
  return hasGlobal();
}

export function isElectron(): boolean {
  // https://github.com/electron/electron/issues/2288#issuecomment-611231970
  return isElectronMain() || isElectronRenderer();
}

// TODO: figure out how to test this
export function isElectronMain(): boolean {
  try {
    return Object.keys(process.versions).some((key) => key === "electron");
  } catch (e) {
    return false;
  }
}

export function isElectronRenderer(): boolean {
  try {
    return /electron/i.test(navigator.userAgent);
  } catch (e) {
    return false;
  }
}

export function isDeno(): boolean {
  try {
    return typeof Deno === "object" && !!Deno.pid;
  } catch (e) {
    return false;
  }
}

export function isJsDom(): boolean {
  // https://github.com/jsdom/jsdom/issues/1537#issuecomment-229405327
  try {
    return hasWindow() && navigator.userAgent.includes("jsdom");
  } catch (e) {
    return false;
  }
}

function hasGlobal() {
  return new Function("try {return this===global}catch(e){ return false}")();
}

function hasWindow() {
  return new Function("try {return this===window}catch(e){ return false}")();
}

function hasDocument() {
  return new Function(
    "try {return this.document !== undefined}catch(e){ return false}"
  )();
}
