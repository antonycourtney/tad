/* @flow */

import * as React from 'react'
import { DragItemTypes } from './constants'
import { DragSource, DropTarget } from 'react-dnd'
import * as actions from '../actions'

const colItemSource = {
  beginDrag (props) {
    console.log('beginDrag: ', props)
    return {
      columnListType: props.columnListType,
      rowData: props.rowData.value,
      stateRefUpdater: props.stateRefUpdater
    }
  }
}

// collect for use as drag source:
function collect (connect, monitor) {
  return {
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging()
  }
}

// for use as drop target:
const colItemTarget = {
  drop (props, monitor, component) {
    const sourceItem = monitor.getItem()
    console.log('drop: ', props, sourceItem)
    actions.reorderColumnList(props, sourceItem)
  }
}

// coleect function for drop target:
function collectDropTarget (connect, monitor) {
  return {
    connectDropTarget: connect.dropTarget(),
    isOver: monitor.isOver()
  }
}

/*
 * A single column row in a column list
 */
class ColumnRow extends React.Component {
  render () {
    const {connectDragSource, connectDropTarget, isOver} = this.props
    const dragHoverClass = isOver ? '' : '' // TODO
    const schema = this.props.schema

    let rowFmt
    if (this.props.rowFormatter) {
      rowFmt = this.props.rowFormatter(this.props.schema, this.props.rowData)
    } else {
      const item = this.props.rowData
      const displayName = item.value.displayName ? item.value.displayName : item.value
      rowFmt = (<td className='col-colName'>{displayName}</td>)
    }
    return connectDropTarget(connectDragSource(
      <tr className={dragHoverClass}>
        {rowFmt}
      </tr>
    ))
  }
}

const DropWrap = DropTarget(DragItemTypes.COLUMN_ID, colItemTarget, collectDropTarget)
const DragWrap = DragSource(DragItemTypes.COLUMN_ID, colItemSource, collect)

export default DropWrap(DragWrap(ColumnRow))
