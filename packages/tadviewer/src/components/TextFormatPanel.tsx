import * as React from "react";
import { Checkbox } from "@blueprintjs/core";
export class TextFormatPanel extends React.Component {
  handleRenderHyperlinksChange(event: any) {
    const opts = this.props.value;
    const checkVal = event.target.checked;
    const nextOpts = opts.set("urlsAsHyperlinks", checkVal);

    if (this.props.onChange) {
      this.props.onChange(nextOpts);
    }
  }

  render() {
    const opts = this.props.value;
    return (
      <div className="format-subpanel">
        <Checkbox
          className="bp3-condensed"
          checked={opts.urlsAsHyperlinks}
          onChange={event => this.handleRenderHyperlinksChange(event)}
          label="Render URLs as Hyperlinks"
        />
      </div>
    );
  }
}
