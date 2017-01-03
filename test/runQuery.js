/* @flow */
/*
 * Just import our test csv file into sqlite, run a sqlite query, and show results
 */

import 'console.table'
import db from 'sqlite'
import * as csvimport from '../src/csvimport'

const testPath = 'csv/bart-comp-all.csv'

// const tq = 'select * from \'bart-comp-all\' limit 10'

const tq = `
SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", "Rec", "_depth", "_pivot", "_isRoot", "_sortVal_0", "_sortVal_1", "_path0"
FROM (
  SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", "Rec", "_depth", "_pivot", "_isRoot", "_sortVal_0", "_sortVal_1", "_path0"
  FROM (
    SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", "Rec", "_depth", "_pivot", "_isRoot", "_sortVal_0", "_sortVal_1", "_pivot" as "_path0"
    FROM (
      SELECT case when min("Name")=max("Name") then min("Name") else null end as "Name", case when min("Title")=max("Title") then min("Title") else null end as "Title", sum("Base") as "Base", sum("OT") as "OT", sum("Other") as "Other", sum("MDV") as "MDV", sum("ER") as "ER", sum("EE") as "EE", sum("DC") as "DC", sum("Misc") as "Misc", sum("TCOE") as "TCOE", case when min("Source")=max("Source") then min("Source") else null end as "Source", case when min("JobFamily")=max("JobFamily") then min("JobFamily") else null end as "JobFamily", case when min("Union")=max("Union") then min("Union") else null end as "Union", sum("Rec") as "Rec", 1 as "_depth", "JobFamily" as "_pivot", 0 as "_isRoot", 1 as "_sortVal_0", 0 as "_sortVal_1"
      FROM (
        SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", 1 as "Rec"
        FROM 'bart-comp-all'
      )
      GROUP BY "JobFamily"
    )
    UNION ALL
    SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", 1 as "Rec", 2 as "_depth", '' as "_pivot", 0 as "_isRoot", 1 as "_sortVal_0", 1 as "_sortVal_1", 'Clerical' as "_path0"
    FROM 'bart-comp-all'
    WHERE "JobFamily"='Clerical'
    UNION ALL
    SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", 1 as "Rec", 2 as "_depth", '' as "_pivot", 0 as "_isRoot", 1 as "_sortVal_0", 1 as "_sortVal_1", 'Audit' as "_path0"
    FROM 'bart-comp-all'
    WHERE "JobFamily"='Audit'
    UNION ALL
    SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", 1 as "Rec", 2 as "_depth", '' as "_pivot", 0 as "_isRoot", 1 as "_sortVal_0", 1 as "_sortVal_1", 'Administrative & Management' as "_path0"
    FROM 'bart-comp-all'
    WHERE "JobFamily"='Administrative & Management'
  )
  ORDER BY "_path0"
) LEFT OUTER JOIN (
  SELECT "JobFamily" as "_path0"
  FROM (
    SELECT "Name", "Title", "Base", "OT", "Other", "MDV", "ER", "EE", "DC", "Misc", "TCOE", "Source", "JobFamily", "Union", 1 as "Rec"
    FROM 'bart-comp-all'
  )
  GROUP BY "JobFamily"
)
USING ("_path0")
ORDER BY "_isRoot" desc, "_sortVal_0", "_path0", "_sortVal_1"
LIMIT 50 OFFSET 0
`

const main = () => {
  let hrstart = 0
  db.open(':memory:')
    .then(() => csvimport.importSqlite(testPath))
    .then(md => {
      console.log('table import complete: ', md.tableName)
      hrstart = process.hrtime()
      return db.all(tq)
    })
    .then(rows => {
      const [es, ens] = process.hrtime(hrstart)
      console.log('read rows from sqlite table.')
      console.table(rows)
      console.info('runQuery: evaluated query in %ds %dms', es, ens / 1e6)
    })
    .then(() => db.close())
    .catch(err => {
      console.error('caught exception in promise chain: ', err, err.stack)
    })
}

main()
