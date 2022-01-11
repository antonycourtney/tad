/**
 * A subset of the Clipboard interface needed by Tad
 */

export interface SimpleClipboard {
  writeText: (text: string) => void;
}
