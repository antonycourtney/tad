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
      columnId: props.columnId,
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
    const appState = this.props.appState
    const schema = appState.baseSchema
    const columnId = this.props.columnId
    const displayName = schema.displayName(columnId)
    // const refUpdater = this.props.stateRefUpdater
    return connectDropTarget(connectDragSource(
      <tr className={dragHoverClass}>
        <td className='col-colName'>{displayName}</td>
      </tr>
    ))
  }
}

const DropWrap = DropTarget(DragItemTypes.COLUMN_ID, colItemTarget, collectDropTarget)
const DragWrap = DragSource(DragItemTypes.COLUMN_ID, colItemSource, collect)

export default DropWrap(DragWrap(ColumnRow))
