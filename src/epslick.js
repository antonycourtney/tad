import { Slick } from 'slickgrid-es6'

import * as aggtree from './aggtree'
import $ from 'jquery'

function SGView (container, ptmodel) {
  // events
  var onDataLoading = new Slick.Event()
  var onDataLoaded = new Slick.Event()

  var grid

  var gridColumnInfo = null

  var options = {
    editable: false,
    enableAddRow: false,
    enableCellNavigation: false
  }

  var loadingIndicator = null

  console.log('Creating SGView.')

  function ensureData (from, to) {
    // TODO: Should probably check for initial image not yet loaded
    // onDataLoading.notify({from: from, to: to})
    onDataLoaded.notify({from: from, to: to})
  }

  function onGridClick (e, args) {
    console.log('onGridClick: ', e, args)
    var item = this.getDataItem(args.row)
    console.log('data item: ', item)
    if (item.isLeaf) {
      return
    }
    var path = aggtree.decodePath(item._path)
    if (item.isOpen) {
      ptmodel.closePath(path)
    } else {
      ptmodel.openPath(path)
    }

    refreshFromModel()
  }

  /* handlers for data loading and completion */
  function registerLoadHandlers (grid) {
    onDataLoading.subscribe(function () {
      if (!loadingIndicator) {
        loadingIndicator = $("<span class='loading-indicator'><label>Buffering...</label></span>").appendTo(document.body)
        var $g = $(container)

        loadingIndicator
          .css('position', 'absolute')
          .css('top', $g.position().top + $g.height() / 2 - loadingIndicator.height() / 2)
          .css('left', $g.position().left + $g.width() / 2 - loadingIndicator.width() / 2)
      }

      loadingIndicator.show()
    })

    onDataLoaded.subscribe(function (e, args) {
      for (var i = args.from; i <= args.to; i++) {
        grid.invalidateRow(i)
      }

      grid.updateRowCount()
      grid.render()

      if (loadingIndicator) {
        loadingIndicator.fadeOut()
      }
    })
  }

  /* Create a grid from the specified set of columns */
  function createGrid (columns, data) {
    grid = new Slick.Grid(container, data, columns, options)

    grid.onViewportChanged.subscribe(function (e, args) {
      var vp = grid.getViewport()
      ensureData(vp.top, vp.bottom)
    })

    grid.onSort.subscribe(function (e, args) {
      grid.setSortColumn(args.sortCol.field, args.sortAsc)
      ptmodel.setSort(args.sortCol.field, args.sortAsc ? 1 : -1)
      var vp = grid.getViewport()
      ensureData(vp.top, vp.bottom)
    })

    grid.onClick.subscribe(onGridClick)

    registerLoadHandlers(grid)

    $(window).resize(function () {
      console.log(' window.resize....')
      var w = $(container).width()
      console.log('container width: ', w)
      grid.resizeCanvas()
    })

    // load the first page
    grid.onViewportChanged.notify()
  }

  //
  var _defaults = {
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

  // options = $.extend(true, {}, _defaults, options)
  options = _defaults // for now

  function defaultGroupCellFormatter (row, cell, value, columnDef, item) {
    if (!options.enableExpandCollapse) {
      return item._pivot
    }

    var indentation = item._depth * 15 + 'px'

    var pivotStr = item._pivot || ''

    var ret = "<span class='" + options.toggleCssClass + ' ' +
      ((!item.isLeaf) ? (item.isOpen ? options.toggleExpandedCssClass : options.toggleCollapsedCssClass) : '') +
      "' style='margin-left:" + indentation + "'>" +
      '</span>' +
      "<span class='" + options.groupTitleCssClass + "' level='" + item._depth + "'>" +
      pivotStr +
      '</span>'
    return ret
  }

  function refreshGrid (dataView) {
    grid.invalidateAllRows() // TODO: optimize
    grid.updateRowCount()
    grid.render()
  }

  function refreshFromModel () {
    ptmodel.refresh().then(refreshGrid)
  }

  // scan table data to make best effort at initial column widths
  function getInitialColWidths (dataView) {
    // let's approximate the column width:
    var MINCOLWIDTH = 80
    var MAXCOLWIDTH = 300
    var colWidths = {}
    var nRows = dataView.getLength()
    for (var i = 0; i < nRows; i++) {
      var row = dataView.getItem(i)
      var cnm
      for (cnm in row) {
        var cellVal = row[ cnm ]
        var cellWidth = MINCOLWIDTH
        if (cellVal) {
          cellWidth = 8 + (6 * cellVal.toString().length) // TODO: measure!
        }
        colWidths[ cnm ] = Math.min(MAXCOLWIDTH,
          Math.max(colWidths[ cnm ] || MINCOLWIDTH, cellWidth))
      }
    }

    return colWidths
  }

  // construct SlickGrid column info from RelTab schema:
  function mkGridCols (schema, colWidths, showHiddenColumns) {
    var gridWidth = 0 // initial padding amount
    var GRIDWIDTHPAD = 16

    var gridCols = []
    if (showHiddenColumns) {
      gridCols.push({ id: '_id', field: '_id', name: '_id' })
      gridCols.push({ id: '_parentId', field: '_parentId', name: '_parentId' })
    }
    for (var i = 0; i < schema.columns.length; i++) {
      var colId = schema.columns[ i ]
      if (!showHiddenColumns) {
        if (colId[0] === '_') {
          if (colId !== '_pivot') {
            continue
          }
        }
      }
      var cmd = schema.columnMetadata[ colId ]
      var ci = { id: colId, field: colId }
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
      var colWidth = colWidths[ ci.field ]
      if (i === schema.columns.length - 1) {
        // pad out last column to allow for dynamic scrollbar
        colWidth += GRIDWIDTHPAD
      }
      // console.log( "column ", i, "id: ", ci.id, ", name: '", ci.name, "', width: ", colWidth )
      ci.width = colWidth
      gridWidth += colWidth

      gridCols.push(ci)
    }

    var columnInfo = { gridCols: gridCols, contentColWidths: colWidths, gridWidth: gridWidth }

    return columnInfo
  }

  function loadInitialImage (dataView) {
    console.log('loadInitialImage: ', dataView)

    var showHiddenColumns = false // Useful for debugging.  TODO: make configurable!

    var colWidths = getInitialColWidths(dataView)
    gridColumnInfo = mkGridCols(dataView.schema, colWidths, showHiddenColumns)

    createGrid(gridColumnInfo.gridCols, dataView)
    // console.log( "loadInitialImage: setting container width to: ", gridColumnInfo.gridWidth )
    // $(container).css('width', gridColumnInfo.gridWidth + 'px')
    grid.resizeCanvas()
  }

  ptmodel.refresh()
    .then(loadInitialImage)
    .catch(err => console.error('loadInitialImage: async error: ', err, err.stack))
}

export function sgView (div, ptmodel) {
  return new SGView(div, ptmodel)
}

function SGController (sgview, ptmodel) {
  // TODO
}

export function sgController (sgview, ptmodel) {
  return new SGController(sgview, ptmodel)
}
