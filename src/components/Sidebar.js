/* @flow */

import * as React from 'react'

export default class Sidebar extends React.Component {

  render () {
    return (
      <div className='full-height sidebar sidebar-collapsed'>
        <div className='sidebar-placeholder'>
          <div className='btn-lg'>
            <span className='glyphicon glyphicon-menu-hamburger' aria-hidden='true' />
          </div>
        </div>
        <div className='sidebar-content'>
          <h4>Columns:</h4>
          <p>Columns go here!</p>
        </div>
      </div>
    )
  }
}
