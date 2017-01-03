/*
 * Basic snapshot testing for tape
 */
import * as fs from 'fs'
import * as path from 'path'
import mkdirp from 'mkdirp'

/*
 * Local state information
 */
let initialized = false
let recordOnlyMode = false  // record snapshots and pass all comparisons
let dirty = false
let testHarness = null

// For each test, we map messages to snapshot values:
type SnapMap = {[msg: string]: any}
type TestMap = {[testName: string]: SnapMap}

let savedSnaps : TestMap = {}

// right now assumes this runs in top level directory...
const snapshotPath = './test/__snapshots__/tapeSnapData.json'

// read saved snapshots and install exit handler to update if needed
const init = (htest) => {
  if (initialized) {
    if (testHarness !== htest) {
      throw new Error('attempt to re-(init)ialize tape-snap with different tape harness. Not supported.')
    }
    return deepEqualSnap
  }
  if (fs.existsSync(snapshotPath)) {
    const savedContentsStr = fs.readFileSync(snapshotPath, {encoding: 'utf-8'})
    const savedContents = JSON.parse(savedContentsStr)
    savedSnaps = savedContents.snapshotData
  } else {
    console.log('snapshot file "' + snapshotPath + '" not found, running in record-only mode...')
    recordOnlyMode = true
  }
  htest.onFinish(() => {
    if (dirty) {
      console.log('updating snapshot file')
      const snapshotDir = path.dirname(snapshotPath)
      const made = mkdirp.sync(snapshotDir)
      if (made) {
        console.log('created directory "' + snapshotDir + '"')
      }
      const snapFileData = {
        snapshotFileFormat: 1,
        snapshotData: savedSnaps
      }
      const snapFileStr = JSON.stringify(snapFileData, null, 2)

      fs.writeFileSync(snapshotPath, snapFileStr, {encoding: 'utf-8'})
      console.log('wrote "' + snapshotPath + '"')
    }
  })
  initialized = true
  testHarness = htest
  return deepEqualSnap
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
function deepEqualSnap (t: any, val: any, msg: string) {
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

// Note: The hacky exporting of recordAll as an auxiliary interface to
// deepEqualSnap requires an old-style module.exports.
// TODO: Just update to new, ES6-style exports and export both entry
// points directly
module.exports = init
