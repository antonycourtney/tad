/* @flow */

import * as React from 'react'
import PivotTreeModel from '../PivotTreeModel'
import * as aggtree from '../aggtree'
import $ from 'jquery'
import * as _ from 'lodash'
import { Slick } from 'slickgrid-es6'
import * as reltab from '../reltab'

const container = '#epGrid' // for now

const options = {
  groupCssClass: 'slick-group',
  groupTitleCssClass: 'slick-group-title',
  totalsCssClass: 'slick-group-totals',
  groupFocusable: true,
  totalsFocusable: false,
  toggleCssClass: 'slick-group-toggle',
  toggleExpandedCssClass: 'expanded',
  toggleCollapsedCssClass: 'collapsed',
  enableExpandCollapse: true,
  groupFormatter: defaultGroupCellFormatter
}

const INDENT_PER_LEVEL = 15 // pixels

const calcIndent = (depth: number): number => (INDENT_PER_LEVEL * depth)

function defaultGroupCellFormatter (row, cell, value, columnDef, item) {
  if (!options.enableExpandCollapse) {
    return item._pivot
  }

  var indentation = calcIndent(item._depth) + 'px'

  var pivotStr = item._pivot || ''

  var ret = "<span class='" + options.toggleCssClass + ' ' +
    ((!item._isLeaf) ? (item._isOpen ? options.toggleExpandedCssClass : options.toggleCollapsedCssClass) : '') +
    "' style='margin-left:" + indentation + "'>" +
    '</span>' +
    "<span class='" + options.groupTitleCssClass + "' level='" + item._depth + "'>" +
    pivotStr +
    '</span>'
  return ret
}

// scan table data to make best effort at initial column widths
const MINCOLWIDTH = 80
const MAXCOLWIDTH = 300

// TODO: use real font metrics:
const measureStringWidth = (s: string): number => 8 + (5.5 * s.length)

// get column width for specific column:
const getColWidth = (dataView: Object, cnm: string) => {
  let colWidth
  var nRows = dataView.getLength()
  for (var i = 0; i < nRows; i++) {
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
  const headerStrWidth = measureStringWidth(dataView.schema.displayName(cnm))
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
const mkSlickColMap = (schema: reltab.Schema, colWidths: ColWidthMap) => {
  let slickColMap = {}

  // hidden columns:
  slickColMap['_id'] = { id: '_id', field: '_id', name: '_id' }
  slickColMap['_parentId'] = { id: '_parentId', field: '_parentId', name: '_parentId' }
  for (let colId of schema.columns) {
    let cmd = schema.columnMetadata[ colId ]
    let ci: any = { id: colId, field: colId, cssClass: '', name: '', formatter: null }
    if (colId === '_pivot') {
      ci.cssClass = 'pivot-column'
      ci.name = ''
      ci.formatter = options.groupFormatter
    } else {
      var displayName = cmd.displayName || colId
      ci.name = displayName
      ci.toolTip = displayName
      ci.sortable = true
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
export default class Grid extends React.Component {
  sgv: Object
  ptm: PivotTreeModel
  onDataLoading: Object
  onDataLoaded: Object
  grid: Object
  colWidthsMap: ColWidthMap
  slickColMap: Object
  loadingIndicator: any

  constructor (props: any) {
    super(props)
    const appState = this.props.appState

    // This should probably live in this.state...
    this.ptm = new PivotTreeModel(appState.rtc, appState.baseQuery, [], appState.showRoot)
    this.ptm.openPath([])
  }

  isPivoted () {
    return (this.props.appState.vpivots.length > 0)
  }

  ensureData (from: number, to: number) {
    // TODO: Should probably check for initial image not yet loaded
    // onDataLoading.notify({from: from, to: to})
    this.onDataLoaded.notify({from: from, to: to})
  }

  onGridClick (e: any, args: any) {
    console.log('onGridClick: ', e, args)
    var item = this.grid.getDataItem(args.row)
    console.log('data item: ', item)
    if (item._isLeaf) {
      return
    }
    var path = aggtree.decodePath(item._path)
    if (item._isOpen) {
      this.ptm.closePath(path)
    } else {
      this.ptm.openPath(path)
    }

    this.refreshFromModel()
  }


  // Get grid columns based on current column visibility settings:
  getGridCols (dataView: ?Object = null) {
    const displayCols = this.props.appState.displayColumns

    // TODO: For debugging could optionally append hidden column ids: _path, _pivot, etc.

    let gridCols = displayCols.map(cid => this.slickColMap[cid])
    if (this.isPivoted()) {
      this.updateColWidth(dataView, '_pivot')
      let pivotCol = this.slickColMap['_pivot']
      gridCols.unshift(pivotCol)
    }
    return gridCols
  }

  refreshGrid (dataView: any) {
    this.grid.setColumns(this.getGridCols(dataView))

    this.grid.invalidateAllRows() // TODO: optimize
    this.grid.updateRowCount()
    this.grid.render()
  }

  refreshFromModel () {
    this.ptm.refresh().then(dataView => this.refreshGrid(dataView))
  }

  /* handlers for data loading and completion */
  registerLoadHandlers (grid: any) {
    this.onDataLoading.subscribe(() => {
      if (!this.loadingIndicator) {
        this.loadingIndicator = $("<span class='loading-indicator'><label>Buffering...</label></span>").appendTo(document.body)
        var $g = $(container)

        if (!this.loadingIndicator || !($g)) {
          return
        }

        this.loadingIndicator
          .css('position', 'absolute')
          .css('top', $g.position().top + $g.height() / 2 - this.loadingIndicator.height() / 2)
          .css('left', $g.position().left + $g.width() / 2 - this.loadingIndicator.width() / 2)
      }

      this.loadingIndicator.show()
    })
  }

  /* Create grid from the specified set of columns */
  createGrid (columns: any, data: any) {
    this.grid = new Slick.Grid(container, data, columns, options)

    this.grid.onViewportChanged.subscribe((e, args) => {
      const vp = this.grid.getViewport()
      this.ensureData(vp.top, vp.bottom)
    })

    this.grid.onSort.subscribe((e, args) => {
      this.grid.setSortColumn(args.sortCol.field, args.sortAsc)
      this.ptm.setSort(args.sortCol.field, args.sortAsc ? 1 : -1)
      const vp = this.grid.getViewport()
      this.ensureData(vp.top, vp.bottom)
    })

    this.grid.onClick.subscribe((e, args) => this.onGridClick(e, args))

    this.registerLoadHandlers(this.grid)

    $(window).resize(() => {
      this.grid.resizeCanvas()
    })

    // load the first page
    this.grid.onViewportChanged.notify()
  }

  updateColWidth (dataView: any, colId: string) {
    const colWidth = getColWidth(dataView, colId)
    this.colWidthsMap[ colId ] = colWidth
    this.slickColMap[ colId ].width = colWidth
  }

  loadInitialImage (dataView: any) {
    console.log('loadInitialImage: ', dataView)

    this.colWidthsMap = getInitialColWidthsMap(dataView)
    this.slickColMap = mkSlickColMap(dataView.schema, this.colWidthsMap)
    this.createGrid(this.getGridCols(), dataView)
    // console.log( "loadInitialImage: setting container width to: ", gridColumnInfo.gridWidth )
    // $(container).css('width', gridColumnInfo.gridWidth + 'px')
    this.grid.resizeCanvas()
  }

  componentDidMount () {
    this.onDataLoading = new Slick.Event()
    this.onDataLoaded = new Slick.Event()
    this.loadingIndicator = null

    this.onDataLoaded.subscribe((e, args) => {
      for (let i = args.from; i <= args.to; i++) {
        this.grid.invalidateRow(i)
      }

      this.grid.updateRowCount()
      this.grid.render()

      if (this.loadingIndicator) {
        this.loadingIndicator.fadeOut()
      }
    })
    this.ptm.refresh()
      .then(dataView => this.loadInitialImage(dataView))
      .catch(err => console.error('loadInitialImage: async error: ', err, err.stack))
  }

  componentWillReceiveProps (props: any) {
    const prevPivots = this.ptm.getPivots()
    const pivots = props.appState.vpivots

    if (!(_.isEqual(prevPivots, pivots))) {
      this.ptm.setPivots(pivots)
      this.refreshFromModel()
    }

    if (this.props.appState.showRoot !== props.appState.showRoot) {
      this.ptm.setShowRoot(props.appState.showRoot)
      this.refreshFromModel()
    }
  }

  shouldComponentUpdate () {
    return false // slickgrid will handle it
  }

  render () {
    return (
      <div id='epGrid' className='slickgrid-container full-height' />
    )
  }
 }
