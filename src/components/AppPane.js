/* @flow */

import * as React from 'react'
import Sidebar from './Sidebar'
import GridPane from './GridPane'
import LoadingModal from './LoadingModal'
import FilterDialog from './FilterDialog'
import { DragDropContext } from 'react-dnd'
import HTML5Backend from 'react-dnd-html5-backend'
import { FocusStyleManager } from '@blueprintjs/core'

/**
 * top level application pane
 */

class AppPane extends React.Component {
  grid: any
  state: { showFilterDialog: boolean }

  constructor (props: any) {
    super(props)
    this.state = { showFilterDialog: false }
  }

  handleFilterButtonClicked (event: any) {
    this.setState({ showFilterDialog: true })
  }

  handleFilterClose (event: any) {
    this.setState({ showFilterDialog: false })
  }

  handleFilterCancel (event: any) {
    this.setState({ showFilterDialog: false })
  }

  handleFilterApply (event: any) {
    this.setState({ showFilterDialog: false })
  }

  handleSlickGridCreated (grid: any) {
    this.grid = grid
  }

  /*
   * Attempt to scroll column into view on click in column selector
   *
   * Doesn't actually seem to work reliably in practice; seems like a
   * bug in SlickGrid, so is turned off.
   *
   * add  onColumnClick={cid => this.handleColumnClick(cid)} to
   * Sidebar to re-enable.
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
            baseSchema={appState.baseSchema}
            viewParams={viewParams}
            stateRefUpdater={this.props.stateRefUpdater} />
          <div className='center-app-pane'>
            <FilterDialog
              isOpen={this.state.showFilterDialog}
              onClose={e => this.handleFilterClose(e)}
              onCancel={e => this.handleFilterCancel(e)}
              onApply={e => this.handleFilterApply(e)}
            />
            <GridPane
              onSlickGridCreated={grid => this.handleSlickGridCreated(grid)}
              appState={appState}
              viewState={viewState}
              stateRefUpdater={this.props.stateRefUpdater} />
            <div className='app-footer'>
              <a
                onClick={(event) => this.handleFilterButtonClicked(event)}
                tabIndex='0'>Filter:</a>
              <span className='filter-summary'> x is not null</span>
            </div>
          </div>
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
