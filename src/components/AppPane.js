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
  componentDidMount () {
    FocusStyleManager.onlyShowFocusOnTabs()
  }

  render () {
    const appState = this.props.appState

    let mainContents
    if (appState.initialized) {
      const fileBaseName = path.basename(appState.targetPath)
      const viewState = appState.viewState
      const viewParams = viewState.viewParams
      mainContents = (
        <div className='container-fluid full-height'>
          <nav id='titlebar' className='pt-navbar'>
            <div className='pt-navbar-group pt-align-right'>
              <div className='pt-navbar-heading'>{fileBaseName}</div>
            </div>
          </nav>
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
