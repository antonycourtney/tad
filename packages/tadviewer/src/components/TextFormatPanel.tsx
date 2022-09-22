import * as React from "react";
import { Checkbox } from "@blueprintjs/core";
import { TextFormatOptions } from "../TextFormatOptions";

export interface TextFormatPanelProps {
  opts: TextFormatOptions;
  onChange?: (opts: TextFormatOptions) => void;
}

export const TextFormatPanel: React.FC<TextFormatPanelProps> = ({
  opts,
  onChange,
}) => {
  const handleRenderHyperlinksChange = (event: any) => {
    const checkVal = event.target.checked;
    const nextOpts = opts.set(
      "urlsAsHyperlinks",
      checkVal
    ) as TextFormatOptions;

    if (onChange) {
      onChange(nextOpts);
    }
  };

  return (
    <div className="format-subpanel">
      <Checkbox
        className="bp4-condensed"
        checked={opts.urlsAsHyperlinks}
        onChange={(event) => handleRenderHyperlinksChange(event)}
        label="Render URLs as Hyperlinks"
      />
    </div>
  );
};
