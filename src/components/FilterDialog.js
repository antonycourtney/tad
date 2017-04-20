/* @flow */

import * as React from 'react'
import {Dialog, Button} from '@blueprintjs/core'

export default class FilterDialog extends React.Component {
  render () {
    return (
      <Dialog
        iconName='filter'
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        title='Filter'
      >
        <div className='pt-dialog-body'>
          Some content
        </div>
        <div className='pt-dialog-footer'>
          <div className='pt-dialog-footer-actions'>
            <Button text='Cancel'
              onClick={this.props.onCancel}
             />
            <Button
              className='pt-intent-primary'
              onClick={this.props.onApply}
              text='Apply'
            />
          </div>
        </div>
      </Dialog>
    )
  }
}
