import * as oneref from "oneref";
import * as _ from "lodash";
/*
 * shallow compare two objects for equality.
 *
 * Assumes both objects have the same keys
 * returns true iff values of both objects are ===
 */

export const shallowEqual = (o1: any, o2: any): boolean => {
  const keys = _.keys(o1);

  for (let k of keys) {
    if (o1[k] !== o2[k]) {
      return false;
    }
  }

  return true;
};
/**
 * composition of refUpdater and immutable's updateIn
 *
 * (should move in to oneref)
 */

export type StateUpdater<A> = (st: oneref.StateTransformer<A>) => void;

export const pathUpdater =
  <A extends any, B extends any>(
    ref: oneref.StateRef<A>,
    path: Array<string>
  ): StateUpdater<B> =>
  (uf: (b: B) => B) => {
    oneref.update(ref, (st: A) => (st as any).updateIn(path, uf) as A);
  };
