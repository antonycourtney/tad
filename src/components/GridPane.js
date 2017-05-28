/* @flow */

// for debugging resize handler:
// import $ from 'jquery'
import * as React from 'react'
import * as _ from 'lodash'
import { Slick, Plugins } from 'slickgrid-es6'
import { WindowResizeListener } from 'react-window-resize-listener'
import * as reltab from '../reltab'
import * as actions from '../actions'
import LoadingModal from './LoadingModal'
import PagedDataView from '../PagedDataView'
import ViewParams from '../ViewParams'
import * as util from '../util'
import {clipboard} from 'electron'
import csv from 'fast-csv'

const { CellRangeSelector, CellSelectionModel, CellCopyManager } = Plugins

const container = '#epGrid' // for now

const gridOptions = {
  multiColumnSort: true
}

const INDENT_PER_LEVEL = 15 // pixels

const calcIndent = (depth: number): number => (INDENT_PER_LEVEL * depth)

/*
 * Formatter for cells in pivot column
 */
const groupCellFormatter = (row, cell, value, columnDef, item) => {
  const toggleCssClass = 'slick-group-toggle'
  const toggleExpandedCssClass = 'expanded'
  const toggleCollapsedCssClass = 'collapsed'
  const groupTitleCssClass = 'slick-group-title'

  var indentation = calcIndent(item._depth) + 'px'

  var pivotStr = item._pivot || ''

  const expandClass = ((!item._isLeaf) ? (item._isOpen ? toggleExpandedCssClass : toggleCollapsedCssClass) : '')
  const ret = `
<span class='${toggleCssClass} ${expandClass}' style='margin-left: ${indentation}'>
</span>
<span class='${groupTitleCssClass}' level='${item._depth}'>${pivotStr}</span>`
  return ret
}

// scan table data to make best effort at initial column widths
const MINCOLWIDTH = 80
const MAXCOLWIDTH = 300

// TODO: use real font metrics:
const measureStringWidth = (s: string): number => 8 + (5.5 * s.length)
const measureHeaderStringWidth = (s: string): number => 24 + (5.5 * s.length)

// get column width for specific column:
const getColWidth = (dataView: PagedDataView, cnm: string) => {
  let colWidth
  const offset = dataView.getOffset()
  const limit = offset + dataView.getItemCount()
  for (var i = offset; i < limit; i++) {
    var row = dataView.getItem(i)
    var cellVal = row[ cnm ]
    var cellWidth = MINCOLWIDTH
    if (cellVal) {
      cellWidth = measureStringWidth(cellVal.toString())
    }
    if (cnm === '_pivot') {
      cellWidth += calcIndent(row._depth + 2)
    }
    colWidth = Math.min(MAXCOLWIDTH,
      Math.max(colWidth || MINCOLWIDTH, cellWidth))
  }
  const displayName = dataView.schema.displayName(cnm)
  const headerStrWidth = measureHeaderStringWidth(displayName)
  colWidth = Math.min(MAXCOLWIDTH,
    Math.max(colWidth || MINCOLWIDTH, headerStrWidth))
  return colWidth
}

type ColWidthMap = {[cid: string]: number}

function getInitialColWidthsMap (dataView: Object): ColWidthMap {
  // let's approximate the column width:
  var colWidths = {}
  var nRows = dataView.getLength()
  if (nRows === 0) {
    return {}
  }
  const initRow = dataView.getItem(0)
  for (let cnm in initRow) {
    colWidths[cnm] = getColWidth(dataView, cnm)
  }

  return colWidths
}

/*
 * Construct map of SlickGrid column descriptors from base schema
 * and column width info
 *
 * Map should contain entries for all column ids
 */
const mkSlickColMap = (schema: reltab.Schema, viewParams: ViewParams, colWidths: ColWidthMap) => {
  let slickColMap = {}

  // hidden columns:
  slickColMap['_id'] = { id: '_id', field: '_id', name: '_id' }
  slickColMap['_parentId'] = { id: '_parentId', field: '_parentId', name: '_parentId' }
  for (let colId of schema.columns) {
    let cmd = schema.columnMetadata[ colId ]
    if (!cmd) {
      console.error('could not find column metadata for ', colId, schema)
    }
    let ci: any = { id: colId, field: colId, cssClass: '', name: '', formatter: null }
    if (colId === '_pivot') {
      const pivotNames = viewParams.vpivots.map(cid => schema.displayName(cid))
      const leafCid = viewParams.pivotLeafColumn
      let leafPivotStr = leafCid ? (' > ' + schema.displayName(leafCid)) : ''
      const pivotDisplayName = 'Pivot: ' + pivotNames.join(' > ') + leafPivotStr
      ci.cssClass = 'pivot-column'
      ci.name = pivotDisplayName
      ci.toolTip = pivotDisplayName
      ci.formatter = groupCellFormatter
    } else {
      var displayName = cmd.displayName || colId
      ci.name = displayName
      ci.toolTip = displayName
      ci.sortable = true
      const ff = viewParams.getColumnFormat(schema, colId).getFormatter()
      ci.formatter = (row, cell, value, columnDef, item) => ff(value)
    }
    ci.width = colWidths[ colId ]
    slickColMap[ colId ] = ci
  }
  return slickColMap
}

/**
 * React component wrapper around SlickGrid
 *
 */
export default class GridPane extends React.Component {
  grid: Object
  colWidthsMap: ColWidthMap
  slickColMap: Object

  isPivoted () {
    const viewParams = this.props.viewState.viewParams
    return (viewParams.vpivots.length > 0)
  }

  onGridClick (e: any, args: any) {
    const viewParams = this.props.viewState.viewParams
    var item = this.grid.getDataItem(args.row)
    if (item._isLeaf) {
      return
    }
    const vpivots = viewParams.vpivots
    let path = []
    for (let i = 0; i < vpivots.length; i++) {
      let pathItem = item['_path' + i]
      if (pathItem == null) {
        break
      }
      path.push(item['_path' + i])
    }
    if (item._isOpen) {
      actions.closePath(path, this.props.stateRefUpdater)
    } else {
      actions.openPath(path, this.props.stateRefUpdater)
    }
  }

  // Get grid columns based on current column visibility settings:
  getGridCols (dataView: ?Object = null) {
    const viewParams = this.props.viewState.viewParams
    const showHiddenCols = viewParams.showHiddenCols
    const displayCols = viewParams.displayColumns

    let gridCols = displayCols.map(cid => this.slickColMap[cid])
    if (this.isPivoted()) {
      this.updateColWidth(dataView, '_pivot')
      let pivotCol = this.slickColMap['_pivot']
      gridCols.unshift(pivotCol)
    }
    if (showHiddenCols) {
      const hiddenColIds = _.difference(_.keys(this.slickColMap), gridCols.map(gc => gc.field))
      const hiddenCols = hiddenColIds.map(cid => this.slickColMap[cid])
      gridCols = gridCols.concat(hiddenCols)
    }
    return gridCols
  }

  /* Create grid from the specified set of columns */
  createGrid (columns: any, data: any) {
    this.grid = new Slick.Grid(container, data, columns, gridOptions)

    const selectionModel = new CellSelectionModel()
    this.grid.setSelectionModel(selectionModel)
    selectionModel.onSelectedRangesChanged.subscribe((e, args) => {
      // TODO: could store this in app state and show some
      // stats about selected range
    })

    const copyManager = new CellCopyManager()
    this.grid.registerPlugin(copyManager)

    copyManager.onCopyCells.subscribe((e, args) => {
      const range = args.ranges[0]
      let copyData = []
      for (let row = range.fromRow; row <= range.toRow; row++) {
        const rowData = data.getItem(row)
        const copyRow = []
        for (let col = range.fromCell; col <= range.toCell; col++) {
          const cid = columns[col].id
          copyRow.push(rowData[cid])
        }
        copyData.push(copyRow)
      }
      csv.writeToString(copyData, {headers: false}, (err, data) => {
        if (err) {
          console.error('error converting copied data to CSV: ', err)
          return
        }
        clipboard.writeText(data)
      })
    })

    const rangeSelector = new CellRangeSelector()

    this.grid.registerPlugin(rangeSelector)

    const updateViewportDebounced = _.debounce(() => {
      const vp = this.grid.getViewport()
      actions.updateViewport(vp.top, vp.bottom, this.props.stateRefUpdater)
    }, 100)

    this.grid.onViewportChanged.subscribe((e, args) => {
      updateViewportDebounced()
    })

    this.grid.onSort.subscribe((e, args) => {
      // convert back from slickGrid format: */
      const sortKey = args.sortCols.map(sc => [sc.sortCol.field, sc.sortAsc])
      actions.setSortKey(sortKey, this.props.stateRefUpdater)
    })

    this.grid.onClick.subscribe((e, args) => this.onGridClick(e, args))

    this.grid.onColumnsReordered.subscribe((e, args) => {
      const cols = this.grid.getColumns()
      const displayColIds = cols.map(c => c.field).filter(cid => cid[0] !== '_')
      actions.setColumnOrder(displayColIds, this.props.stateRefUpdater)
    })

    // load the first page
    this.grid.onViewportChanged.notify()

    if (this.props.onSlickGridCreated) {
      this.props.onSlickGridCreated(this.grid)
    }
  }

  updateColWidth (dataView: any, colId: string) {
    const colWidth = getColWidth(dataView, colId)
    this.colWidthsMap[ colId ] = colWidth
    this.slickColMap[ colId ].width = colWidth
  }

  /*
   * update grid from dataView
   */
  updateGrid (dataView: any) {
    const viewParams = this.props.viewState.viewParams
    // console.log('updateGrid: dataView: offset: ', dataView.getOffset(), 'length: ', dataView.getLength())
    if (!this.colWidthsMap) {
      this.colWidthsMap = getInitialColWidthsMap(dataView)
    }
    this.slickColMap = mkSlickColMap(dataView.schema, viewParams, this.colWidthsMap)
    const gridCols = this.getGridCols(dataView)
    if (!this.grid) {
      // console.log('updateGrid: initial update, creating grid...')
      this.createGrid(gridCols, dataView)
      this.grid.resizeCanvas()
    } else {
      this.grid.setColumns(gridCols)
      this.grid.setData(dataView)
    }
    // update sort columns:
    const vpSortKey = viewParams.sortKey.map(([columnId, sortAsc]) => ({columnId, sortAsc}))
    this.grid.setSortColumns(vpSortKey)
    this.grid.invalidateAllRows()
    this.grid.updateRowCount()
    this.grid.render()
  }

  shouldComponentUpdate (nextProps: any, nextState: any) {
    const viewState = this.props.viewState
    const nextViewState = nextProps.viewState
    const omitPred = (val: any, key: string, obj: Object) => key.startsWith('viewport')
    // N.B.: We use toObject rather than toJS because we only want a
    // shallow conversion
    const vs = _.omitBy(viewState.toObject(), omitPred)
    const nvs = _.omitBy(nextViewState.toObject(), omitPred)
    const ret = !util.shallowEqual(vs, nvs)
    return ret
  }

  handleWindowResize (e: any) {
    if (this.grid) {
      /*
      const $container = $(container)
      console.log('$container: ', $container)
      const pvh = $.css($container[0], 'height', true)
      console.log('viewport height before resize:', pvh)
      */
      this.grid.resizeCanvas()
      /*
      console.log('viewport height after resize:', $.css($container[0], 'height', true))
      console.log('gridPane.handleWindowResize: done with resize and render')
      */
    }
  }

  render () {
    const viewState = this.props.viewState
    const lt = viewState.loadingTimer
    // Only show loading modal if we've been loading more than 500 ms
    const lm = (lt.running && (lt.elapsed > 500)) ? <LoadingModal /> : null
    return (
      <div className='gridPaneOuter'>
        <WindowResizeListener onResize={e => this.handleWindowResize(e)} />
        <div className='gridPaneInner'>
          <div id='epGrid' className='slickgrid-container full-height' />
        </div>
        {lm}
      </div>
    )
  }

  componentDidUpdate (prevProps: any, prevState: any) {
    const dataView = this.props.viewState.dataView
    if ((dataView !== prevProps.viewState.dataView) && dataView != null) {
      this.updateGrid(dataView)
    }
  }
 }
