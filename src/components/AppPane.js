/* @flow */

import * as React from 'react'
import Sidebar from './Sidebar'
import GridPane from './GridPane'
import LoadingModal from './LoadingModal'
import { DragDropContext } from 'react-dnd'
import HTML5Backend from 'react-dnd-html5-backend'
import { FocusStyleManager } from '@blueprintjs/core'
import path from 'path'

/**
 * top level application pane
 */

class AppPane extends React.Component {
  grid: any

  handleSlickGridCreated (grid: any) {
    this.grid = grid
  }

  /*
   * Attempt to scroll column into view on click in column selector
   *
   * Doesn't actually seem to work reliably in practice; seems like a
   * bug in SlickGrid.
   */
  handleColumnClick (cid: string) {
    if (this.grid) {
      const columnIdx = this.grid.getColumnIndex(cid)
      if (columnIdx !== undefined) {
        const vp = this.grid.getViewport()
        this.grid.scrollCellIntoView(vp.top, columnIdx)
      }
    }
  }

  componentDidMount () {
    FocusStyleManager.onlyShowFocusOnTabs()
  }

  render () {
    const appState = this.props.appState

    let mainContents
    if (appState.initialized) {
      const viewState = appState.viewState
      const viewParams = viewState.viewParams
      mainContents = (
        <div className='container-fluid full-height main-container'>
          <Sidebar
            onColumnClick={cid => this.handleColumnClick(cid)}
            baseSchema={appState.baseSchema}
            viewParams={viewParams}
            stateRefUpdater={this.props.stateRefUpdater} />
          <GridPane
            onSlickGridCreated={grid => this.handleSlickGridCreated(grid)}
            appState={appState}
            viewState={viewState}
            stateRefUpdater={this.props.stateRefUpdater} />
        </div>
      )
    } else {
      mainContents = (
        <div className='container-fluid full-height main-container'>
          <LoadingModal />
        </div>
      )
    }
    return mainContents
  }
}

export default DragDropContext(HTML5Backend)(AppPane)
