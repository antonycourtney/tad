/* @flow */

import * as styles from '../less/easypivot.less'

import * as reltab from './reltab' // eslint-disable-line

import { FrozenGrid as Grid } from 'slickgrid-es6'

import data from './example-data'

const columns = [
  {id: 'title', name: 'Title', field: 'title', maxWidth: 100, minWidth: 80},
  {id: 'duration', name: 'Duration', field: 'duration', resizable: false},
  {id: '%', name: '% Complete', field: 'percentComplete'},
  {id: 'start', name: 'Start', field: 'start'},
  {id: 'finish', name: 'Finish', field: 'finish'},
  {id: 'effort-driven', name: 'Effort Driven', field: 'effortDriven'}
]

const options = {
  enableCellNavigation: true,
  enableColumnReorder: false,
  forceFitColumns: !true,
  frozenColumn: 0,
  frozenRow: 1
}

let grid
const init = (id) => {
  grid = new Grid(id, data, columns, options)
}
console.log('Hello EasyPivot!')
init('#epGrid')
console.log('slickgrid initialized')
console.log('grid: ', grid)
console.log('styles: ', styles)
