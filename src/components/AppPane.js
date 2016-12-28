/* @flow */

import * as React from 'react'
import Sidebar from './Sidebar'
import GridPane from './GridPane'
import { DragDropContext } from 'react-dnd'
import HTML5Backend from 'react-dnd-html5-backend'

/**
 * top level application pane
 */

class AppPane extends React.Component {
  render () {
    const appState = this.props.appState
    const viewState = appState.viewState
    const viewParams = viewState.viewParams

    return (
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
  }
}

export default DragDropContext(HTML5Backend)(AppPane)
