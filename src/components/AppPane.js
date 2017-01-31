/* @flow */

import * as React from 'react'
import Sidebar from './Sidebar'
import GridPane from './GridPane'
import LoadingModal from './LoadingModal'
import { DragDropContext } from 'react-dnd'
import HTML5Backend from 'react-dnd-html5-backend'

/**
 * top level application pane
 */

class AppPane extends React.Component {
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
          <GridPane
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
