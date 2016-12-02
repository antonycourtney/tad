/* @flow */

import AppState from './AppState'
import * as reltab from './reltab'

const {constVal} = reltab

export const createAppState = (rtc: reltab.Connection,
  title: string, baseQuery: reltab.QueryExp): Promise<AppState> => {
  // add a count column and do the usual SQL where 1=0 trick:
  const schemaQuery = baseQuery
    .extend('Rec', { type: 'integer' }, 1)
    .filter(reltab.and().eq(constVal(1), constVal(0)))

  const schemap = rtc.evalQuery(schemaQuery)
  return schemap.then(schemaRes => {
    const baseSchema = schemaRes.schema

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

export const toggleShowRoot = (updater: RefUpdater): void => {
  updater(appState => appState.set('showRoot', !(appState.showRoot)))
}
