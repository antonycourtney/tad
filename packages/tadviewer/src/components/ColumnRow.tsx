import * as React from "react";

import { DragItemType, DragItemTypes, ColumnListType } from "./defs";
import {
  DragSource,
  DropTarget,
  ConnectDragSource,
  ConnectDropTarget,
  DragSourceConnector,
  DragSourceMonitor,
  DropTargetMonitor,
  DropTargetConnector,
} from "react-dnd";
import * as actions from "../actions";
import * as reltab from "reltab";
import { StateRef } from "oneref";
import { Schema } from "reltab";
import { AppState } from "../AppState";

type ColumnId = string;
export type ColumnRowData = [string, boolean] | ColumnId;
export type ColumnRowPairFormatter = (
  schema: Schema,
  row: [string, boolean]
) => JSX.Element[];
export type ColumnRowColumnIdFormatter = (
  schema: Schema,
  cid: ColumnId
) => JSX.Element[];
export type ColumnRowFormatter =
  | ColumnRowPairFormatter
  | ColumnRowColumnIdFormatter;

export interface ColumnRowProps {
  columnListType: ColumnListType;
  schema: reltab.Schema;
  rowFormatter?: ColumnRowFormatter;
  rowData: ColumnRowData;
  stateRef: StateRef<AppState>;

  connectDragSource: ConnectDragSource;
  connectDropTarget: ConnectDropTarget;
  isOver: boolean;
}

const colItemSource = {
  beginDrag(props: ColumnRowProps) {
    console.log("beginDrag: ", props);
    return {
      columnListType: props.columnListType,
      rowData: props.rowData,
      stateRef: props.stateRef,
    };
  },
};

// collect for use as drag source:
function collect(connect: DragSourceConnector, monitor: DragSourceMonitor) {
  return {
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging(),
  };
}

// for use as drop target:
const colItemTarget = {
  drop(props: ColumnRowProps, monitor: DropTargetMonitor) {
    const sourceItem = monitor.getItem();
    console.log("drop: ", props, sourceItem);
    actions.reorderColumnList(props, sourceItem);
  },
};

function collectDropTarget(
  connect: DropTargetConnector,
  monitor: DropTargetMonitor
) {
  return {
    connectDropTarget: connect.dropTarget(),
    isOver: monitor.isOver(),
  };
}

/*
 * A single column row in a column list
 */
const RawColumnRow: React.FC<ColumnRowProps> = ({
  columnListType,
  schema,
  rowFormatter,
  rowData,
  stateRef,
  connectDragSource,
  connectDropTarget,
  isOver,
}) => {
  const dragHoverClass = isOver ? "" : ""; // TODO

  let rowFmt: JSX.Element[];

  if (rowFormatter) {
    rowFmt = rowFormatter(schema, rowData as any);
  } else {
    const columnId = rowData;
    const colIdStr = columnId as string;
    const displayName = schema.displayName(columnId as string);
    rowFmt = [
      <td key={"dpy-" + colIdStr} className="col-colName">
        {displayName}
      </td>,
    ];
  }

  return connectDropTarget(
    connectDragSource(<tr className={dragHoverClass}>{rowFmt}</tr>)
  );
};

const DropWrap = DropTarget(
  DragItemTypes.COLUMN_ID,
  colItemTarget,
  collectDropTarget
);
const DragWrap = DragSource(DragItemTypes.COLUMN_ID, colItemSource, collect);
export const ColumnRow = DropWrap(DragWrap(RawColumnRow));
