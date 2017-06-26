/* @flow */

import * as React from 'react'
import SidebarContent from './SidebarContent'

export default class Sidebar extends React.Component {
  state: any

  constructor (props: any) {
    super(props)
    this.state = {expanded: false}
  }

  onExpandClick () {
    this.setState({expanded: !this.state.expanded})
  }

  render () {
    const expandClass = this.state.expanded ? 'sidebar-expanded' : 'sidebar-collapsed'

    return (
      <div className={'sidebar ' + expandClass}>
        <div className='sidebar-placeholder'>
          <button type='button' className='pt-button pt-minimal pt-icon-cog'
                  onClick={e => this.onExpandClick(e)} />
        </div>
        <div className='sidebar-content'>
          <div className='sidebar-content-inner'>
            <button type='button'
                    className='pt-button pt-icon-chevron-left sidebar-collapse-button'
                    onClick={e => this.onExpandClick(e)}/>
            <SidebarContent {...this.props} />
          </div>
        </div>
      </div>
    )
  }
}
