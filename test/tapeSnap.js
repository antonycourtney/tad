/*
 * Basic snapshot testing for tape
 */
import test from 'tape'
import * as fs from 'fs'
import * as path from 'path'
import mkdirp from 'mkdirp'

/*
 * Local state information
 */
let initialized = false
let recordOnlyMode = false  // record snapshots and pass all comparisons
let dirty = false

// For each test, we map messages to snapshot values:
type SnapMap = {[msg: string]: any}
type TestMap = {[testName: string]: SnapMap}

let savedSnaps : TestMap = {}

// right now assumes this runs in top level directory...
const snapshotPath = './test/__snapshots__/tapeSnapData.json'

// read saved snapshots and install exit handler to update if needed
const init = (t) => {
  if (fs.existsSync(snapshotPath)) {
    const savedContentsStr = fs.readFileSync(snapshotPath, {encoding: 'utf-8'})
    const savedContents = JSON.parse(savedContentsStr)
    savedSnaps = savedContents.snapshotData
  } else {
    t.comment('snapshot file "' + snapshotPath + '" not found, running in record-only mode...')
    recordOnlyMode = true
  }
  const tx : any = test
  tx.onFinish(() => {
    t.comment('in onFinish handler')
    if (dirty) {
      t.comment('updating snapshot file')
      const snapshotDir = path.dirname(snapshotPath)
      const made = mkdirp.sync(snapshotDir)
      if (made) {
        t.comment('created directory "' + snapshotDir + '"')
      }
      const snapFileData = {
        snapshotFileFormat: 1,
        snapshotData: savedSnaps
      }
      const snapFileStr = JSON.stringify(snapFileData, null, 2)

      fs.writeFileSync(snapshotPath, snapFileStr, {encoding: 'utf-8'})
      t.comment('wrote "' + snapshotPath + '"')
    }
  })
  initialized = true
}

const ensureInitialized = (t: any) => {
  if (!initialized) {
    init(t)
  }
}

/*
 * look up snapshot for the given test name and msg.
 *
 * Returns: Snapshot value if found, null or undefined otherwise
 */
const findSnapshot = (testName: string, msg: string): any => {
  if (recordOnlyMode) {
    return null
  }
  const testSnaps = savedSnaps[testName]
  if (!testSnaps) {
    return testSnaps
  }
  return testSnaps[msg]
}

const recordSnapshot = (testName: string, msg: string, val: any) => {
  let testSnaps = savedSnaps[testName]
  if (!testSnaps) {
    testSnaps = {}
  }
  testSnaps[msg] = val
  savedSnaps[testName] = testSnaps
  dirty = true
}
/**
 *
 * Compare a value to saved snapshot (if any) using t.deepEqual
 *
 */
// TODO: don't use any type here, add name to Flow-typed declarations
export default function deepEqualSnap (t: any, val: any, msg: string) {
  ensureInitialized(t)

  const prevSnap = findSnapshot(t.name, msg)

  if (prevSnap && !recordOnlyMode) {
    // comparing to previous snapshot:
    t.deepEqual(val, prevSnap, msg + ' (comparing to saved snapshot)')
  } else {
    recordSnapshot(t.name, msg, val)
    t.pass(msg + ' (recorded new snapshot)')
  }
}

/**
 * out-of-band interface for use by testing tool:
 *
 * If called with true, will record new snapshots in all calls to
 * deepEqualSnap
 */
deepEqualSnap.recordAll = function (doIt: boolean) {
  if (doIt) {
    recordOnlyMode = true
  }
}
