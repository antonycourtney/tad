/* @flow */

import tapeSnapInit from './tapeSnap'
import PathTree from '../src/PathTree'

module.exports = (htest: any) => {
  const deepEqualSnap = tapeSnapInit(htest)
  htest('basic PathTree', t => {
    const pt0 = new PathTree()

    const pt1 = pt0.open(['foo', 'bar', 'baz'])

    console.log('pt1: ', pt1._rep)

    const pt2 = pt1.open(['foo', 'bar', 'blech']).open(['a', 'b', 'c'])

    console.log('pt2: ', pt2._rep)

    for (let path of pt2.iter()) {
      console.log(path)
    }

    const pt2Paths = Array.from(pt2.iter())
    console.log('pt2Paths: ', pt2Paths)
    deepEqualSnap(t, pt2Paths, 'full path set from iterator')

    const pt3 = pt2.close(['foo', 'bar', 'baz'])

    const pt3Paths = Array.from(pt3.iter())
    console.log('pt3Paths: ', pt3Paths)

    deepEqualSnap(t, pt3Paths, 'path set after closing one path')

    const pt4 = pt3.close(['foo', 'bar', 'blech'])

    const pt4Paths = Array.from(pt4.iter())
    console.log('pt4Paths: ', pt4Paths)

    deepEqualSnap(t, pt4Paths, 'path set after closing two paths with common prefix')

    const pt5 = pt4.close(['a', 'b', 'c'])

    const pt5Paths = Array.from(pt5.iter())
    console.log('pt5Paths: ', pt5Paths)

    const isOpenCheck1 = pt2.isOpen(['a', 'b', 'c'])

    t.equal(isOpenCheck1, true, 'basic isOpen check')

    const isOpenCheck2 = pt2.isOpen(['a', 'b', 'd'])

    t.equal(isOpenCheck2, false, 'negative isOpen check')

    t.end()
  })
}
