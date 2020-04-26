import React, { useRef, useLayoutEffect } from "react";

export interface IndeterminateCheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  indeterminate: boolean;
}

export const IndeterminateCheckbox: React.FC<IndeterminateCheckboxProps> = (
  props
) => {
  const checkboxRef = useRef(null);

  useLayoutEffect(() => {
    const component: any = checkboxRef.current;
    if (component !== null) {
      component.indeterminate = props.indeterminate;
    }
  });

  const { indeterminate, ...attrs } = props;
  return <input ref={checkboxRef} type="checkbox" {...attrs} />;
};
