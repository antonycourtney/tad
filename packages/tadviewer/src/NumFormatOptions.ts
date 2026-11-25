import * as Immutable from "immutable";
import { CellFormatter, ClickHandler, FormatOptions } from "./FormatOptions";

/**
 * How numbers are formatted:
 * - "auto" (Automatic): up to AUTO_SIGNIFICANT_DIGITS significant digits,
 *   with thousands separators if `commas` is set. Hides floating point noise
 *   (e.g. 0.1 + 0.2 = 0.30000000000000004) without fixing the number of
 *   decimal places, and switches to scientific notation for very large or
 *   very small magnitudes.
 * - "toString" (Full Precision): JavaScript's toString(), i.e. the shortest
 *   representation that round trips.
 * - "toLocaleString" (Custom): `decimalPlaces`, `commas` and `exponential`.
 */
export type FormatMethod = "auto" | "toLocaleString" | "toString";

export interface NumFormatOptionsProps {
  type: string;
  commas: boolean;
  decimalPlaces: number | undefined;
  exponential: boolean;
  formatMethod: FormatMethod;
}

const defaultNumFormatOptionsProps: NumFormatOptionsProps = {
  type: "NumFormatOptions",
  commas: true,
  decimalPlaces: 2,
  exponential: false,
  formatMethod: "auto",
};

const AUTO_SIGNIFICANT_DIGITS = 12;
// Use scientific notation for magnitudes outside [MIN, MAX):
const AUTO_EXPONENTIAL_MIN = 1e-6;
const AUTO_EXPONENTIAL_MAX = 1e15;

const autoFormat = (val: any, useGrouping: boolean): string => {
  if (typeof val === "bigint") {
    // integer values are exact; don't round them
    return val.toLocaleString(undefined, { useGrouping });
  }
  if (typeof val !== "number") {
    return val.toString();
  }
  const abs = Math.abs(val);
  if (
    abs !== 0 &&
    (abs < AUTO_EXPONENTIAL_MIN || abs >= AUTO_EXPONENTIAL_MAX)
  ) {
    return val.toLocaleString(undefined, {
      notation: "scientific",
      maximumSignificantDigits: AUTO_SIGNIFICANT_DIGITS,
    });
  }
  // Round to AUTO_SIGNIFICANT_DIGITS, but never within the integer part:
  return val.toLocaleString(undefined, {
    maximumSignificantDigits: AUTO_SIGNIFICANT_DIGITS,
    maximumFractionDigits: 0,
    roundingPriority: "morePrecision",
    useGrouping,
  });
};

export class NumFormatOptions
  extends Immutable.Record(defaultNumFormatOptionsProps)
  implements NumFormatOptionsProps, FormatOptions
{
  public readonly type!: string;
  public readonly commas!: boolean;
  public readonly decimalPlaces!: number | undefined;
  public readonly exponential!: boolean;

  getFormatter(): CellFormatter {
    const fmtOpts = {
      minimumFractionDigits: this.decimalPlaces,
      maximumFractionDigits: this.decimalPlaces,
      useGrouping: this.commas,
    };

    const ff = (val?: any): string | undefined | null => {
      if (val == null) {
        return null;
      }

      let ret: string;

      if (this.formatMethod === "auto") {
        ret = autoFormat(val, this.commas);
      } else if (this.formatMethod === "toString") {
        ret = val.toString();
      } else {
        if (this.exponential) {
          const expFmtOpts: BigIntToLocaleStringOptions = {
            notation: "scientific",
          };
          if (this.decimalPlaces) {
            expFmtOpts.minimumFractionDigits = this.decimalPlaces as any;
            expFmtOpts.maximumFractionDigits = this.decimalPlaces as any;
          }
          ret = val.toLocaleString(undefined, expFmtOpts);
        } else {
          ret = val.toLocaleString(undefined, fmtOpts);
        }
      }
      return ret;
    };

    return ff;
  }

  getClassName(): string | null {
    return "data-cell-numeric";
  }

  getClickHandler(): ClickHandler | null {
    return null;
  }
}
