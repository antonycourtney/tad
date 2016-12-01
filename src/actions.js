/* @flow */

import AppState from './AppState'
import * as reltab from './reltab'

const {constVal} = reltab

export const createAppState = (rtc: reltab.Connection,
  title: string, baseQuery: reltab.QueryExp): Promise<AppState> => {
  // add a count column:
  baseQuery = baseQuery.extend('Rec', { type: 'integer' }, 1)
  // obtain schema for base query:

  // For now we'll do the usual SQL where 1=0 trick:
  const schemaQuery = baseQuery.filter(reltab.and().eq(constVal(1), constVal(0)))

  const basep = rtc.evalQuery(schemaQuery)
  return basep.then(baseRes => {
    const baseSchema = baseRes.schema

    // start off with all columns displayed:
    const displayColumns = baseSchema.columns.slice()

    return new AppState({title, rtc, baseSchema, baseQuery, displayColumns})
  })
}

type RefUpdater = (f: ((s: AppState) => AppState)) => void

export const toggleShown = (cid: string, updater: RefUpdater): void => {
  updater(appState => appState.toggleShown(cid))
}

export const togglePivot = (cid: string, updater: RefUpdater): void => {
  updater(appState => appState.togglePivot(cid))
}

export const toggleSort = (cid: string, updater: RefUpdater): void => {
  updater(appState => appState.toggleSort(cid))
}
