import React from "react";
export class IndeterminateCheckbox extends React.Component {
  componentDidMount() {
    this.el.indeterminate = this.props.indeterminate;
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.indeterminate !== this.props.indeterminate) {
      this.el.indeterminate = this.props.indeterminate;
    }
  }

  render() {
    const { indeterminate, ...attrs } = this.props; // eslint-disable-line

    return (
      <input
        ref={el => {
          this.el = el;
        }}
        type="checkbox"
        {...attrs}
      />
    );
  }
}
