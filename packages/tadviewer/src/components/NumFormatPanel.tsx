import * as React from "react";
import { Checkbox, Label } from "@blueprintjs/core";
import { NumFormatOptions } from "../NumFormatOptions";

export interface NumFormatPanelProps {
  opts: NumFormatOptions;
  onChange?: (opts: NumFormatOptions) => void;
}

export const NumFormatPanel: React.FC<NumFormatPanelProps> = ({
  opts,
  onChange,
}) => {
  const decimalsStr = opts.decimalPlaces ? opts.decimalPlaces.toString() : "";
  const [decimalsText, setDecimalsText] = React.useState(decimalsStr);

  const handleFormatMethodSelect = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const nextOpts = opts.set(
      "formatMethod",
      event.target.value as "toLocaleString" | "toString"
    ) as NumFormatOptions;

    if (onChange) {
      onChange(nextOpts);
    }
  };

  const handleCommasChange = (event: any) => {
    const checkVal = event.target.checked;
    const nextOpts = opts.set("commas", checkVal) as NumFormatOptions;

    if (onChange) {
      onChange(nextOpts);
    }
  };

  const handleExponentialChange = (event: any) => {
    const checkVal = event.target.checked;
    const nextOpts = opts.set("exponential", checkVal) as NumFormatOptions;

    if (onChange) {
      onChange(nextOpts);
    }
  };

  const handleDecimalsChange = (event: any) => {
    const nextText = event.target.value;
    setDecimalsText(nextText);
    const decVal = Number.parseInt(nextText);
    let nextDec: number | null;

    if (nextText.length === 0 || isNaN(decVal) || decVal < 0 || decVal > 10) {
      nextDec = null;
    } else {
      nextDec = decVal;
    }

    const nextOpts = opts.set("decimalPlaces", nextDec!) as NumFormatOptions; // explicitly check for value change

    if (onChange && decVal !== opts.decimalPlaces) {
      onChange(nextOpts);
    }
  };

  // slightly evil way to handle this.
  // Necessary because the same format panel object can be re-used with different props
  // when targeting a different column type or column
  /*
   * AC, 4/25/20: Not clear that this is still necessary; it doesn't map nicely to hooks at all.
   * Let's validate / debug.
  useEffect(() => {
    const opts = value;
    const nextOpts = nextProps.value;
    const nextDec = nextOpts.decimalPlaces;

    if (opts.decimalPlaces !== nextDec) {
      const decStr = nextDec ? nextDec.toString() : "";
      this.setState({
        decimalsText: decStr
      });
    }
  });
  */

  const formatMethodSelect = (
    <select
      value={opts.formatMethod}
      onChange={(event) => handleFormatMethodSelect(event)}
    >
      <option value="toString">System Default</option>
      <option value="toLocaleString">Custom</option>
    </select>
  );

  return (
    <div className="format-subpanel num-format-panel">
      <Label>
        Formatting Method&nbsp;
        {formatMethodSelect}
      </Label>
      <Checkbox
        className="bp4-condensed"
        checked={opts.commas}
        disabled={opts.formatMethod === "toString" || opts.exponential}
        onChange={(event) => handleCommasChange(event)}
        label="Use (,) as 1000s Separator"
      />
      <label className="bp4-label bp4-inline">
        Decimal Places
        <input
          className="bp4-input"
          type="text"
          value={decimalsText}
          disabled={opts.formatMethod === "toString"}
          onChange={(event) => handleDecimalsChange(event)}
        />
      </label>
      <Checkbox
        className="bp4-condensed"
        checked={opts.exponential}
        disabled={opts.formatMethod === "toString"}
        onChange={(event) => handleExponentialChange(event)}
        label="Use Scientific (exponential) Notation"
      />
    </div>
  );
};
