/* @flow */

import * as oneref from 'oneref'
import * as _ from 'lodash'

/*
 * shallow compare two objects for equality.
 *
 * Assumes both objects have the same keys
 * returns true iff values of both objects are ===
 */
export const shallowEqual = (o1: Object, o2: Object): boolean => {
  const keys = _.keys(o1)
  for (let k of keys) {
    if (o1[k] !== o2[k]) {
      return false
    }
  }
  return true
}

/**
 * composition of refUpdater and immutable's updateIn
 *
 * (should move in to oneref)
 */
export const pathUpdater = <A>(ref: oneref.Ref<A>, path: Array<string>) => {
  const updater = oneref.refUpdater(ref)
  return (uf: (a:A) => A) => {
    updater(st => {
      return (st: any).updateIn(path, uf)
    })
  }
}
