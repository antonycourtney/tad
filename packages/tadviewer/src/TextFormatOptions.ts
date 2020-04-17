import * as Immutable from "immutable";
import * as he from "he";
import urlRegex from "url-regex";

/*
 * TODO: move to tad-app
const shell = require('electron').shell; // install this globally so we can access in generated a tag:
window.tadOpenExternal = (url: string) => {
  console.log('tadOpenExternal: ', url);
  shell.openExternal(url);
  return false;
};
*/

export interface TextFormatOptionsProps {
  type: string;
  urlsAsHyperlinks: boolean;
}

const defaultTextFormatOptionsProps: TextFormatOptionsProps = {
  type: "TextFormatOptions",
  urlsAsHyperlinks: true
};

const isValidURL = (s: string): boolean =>
  urlRegex({
    exact: true
  }).test(s);

export class TextFormatOptions
  extends Immutable.Record(defaultTextFormatOptionsProps)
  implements TextFormatOptionsProps {
  public readonly type!: string;
  public readonly urlsAsHyperlinks!: boolean;

  getFormatter() {
    const ff = (val?: string | null): string | undefined | null => {
      if (this.urlsAsHyperlinks && val && isValidURL(val)) {
        const ret = `<a href="${val}" onclick='tadOpenExternal("${val}"); return false;'>${val}</a>`;
        return ret;
      }

      return val ? he.encode(val) : val;
    };

    return ff;
  }
}
