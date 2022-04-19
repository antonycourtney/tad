/*
 * A modal overlay to show the loading indicator
 */

import * as React from 'react'

export default class LoadingModal extends React.Component {
  render () {
    return (
      <div className='modal-overlay'>
        <div className='modal-container'>
          <div className='modal-body-container'>
            <span className='loading-indicator'>
              <label>Loading...</label>
            </span>
          </div>
        </div>
      </div>
    )
  }
}
