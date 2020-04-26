import * as React from "react";
import * as reltab from "reltab";

export interface SingleColumnSelectProps {
  schema: reltab.Schema;
  label: string;
  value: string | null | undefined;
  disabled: boolean;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

export const SingleColumnSelect: React.FC<SingleColumnSelectProps> = ({
  schema,
  label,
  value,
  disabled,
  onChange,
}) => {
  const renderColOption = (cid: string): JSX.Element => (
    <option key={cid} value={cid}>
      {schema.displayName(cid)}
    </option>
  );

  const columnIds = schema.columns.slice();
  columnIds.sort((cid1, cid2) =>
    schema.displayName(cid1).localeCompare(schema.displayName(cid2))
  );
  const colOptions = columnIds.map((cid) => renderColOption(cid));
  const noneOption = (
    <option key="__none" value="__none">
      none
    </option>
  );
  colOptions.unshift(noneOption);
  const propVal = value;
  const selVal = propVal === null ? "__none" : propVal;
  return (
    <div className="pivot-leaf-select">
      <label>Pivot Tree Leaf Level:</label>
      <select
        className="scs-select"
        disabled={disabled}
        value={selVal}
        onChange={onChange}
      >
        {colOptions}
      </select>
    </div>
  );
};
