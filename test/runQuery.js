/* @flow */
/*
 * Just import our test csv file into sqlite, run a sqlite query, and show results
 */

import 'console.table'
import db from 'sqlite'
import * as csvimport from '../src/csvimport'

const testPath = 'csv/bart-comp-all.csv'

// const tq = 'select * from \'bart-comp-all\' limit 10'
/*
const t1 = "select '' as \"path\",Name,Title,Base,OT from 'bart-comp-all' where JobFamily='Executive Management'"

const t2 = "select 'fooble' as \"path\",Name,Title,Base,OT from 'bart-comp-all' where JobFamily='Legal & Paralegal'"

const t3 = t1 + '\nunion all\n' + t2
*/
const t4 = `select "_depth", "_pivot", '#' || replace("_pivot",'#','%23') as "_path", "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec" from (select "_pivot", "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec", 1 as "_depth" from (select "JobFamily" as "_pivot", case when min("JobFamily")=max("JobFamily") then min("JobFamily") else null end as "JobFamily", case when min("Title")=max("Title") then min("Title") else null end as "Title", case when min("Union")=max("Union") then min("Union") else null end as "Union", case when min("Name")=max("Name") then min("Name") else null end as "Name", sum("Base") as "Base", sum("TCOE") as "TCOE", sum("Rec") as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", 1 as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE" from 'bart-comp-all')) group by "JobFamily"))`

const t5 = `select "_depth", "_pivot", '#Executive%20Management#' || replace("_pivot",'#','%23') as "_path", "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec" from (select "_pivot", "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec", 2 as "_depth" from (select "Title" as "_pivot", case when min("JobFamily")=max("JobFamily") then min("JobFamily") else null end as "JobFamily", case when min("Title")=max("Title") then min("Title") else null end as "Title", case when min("Union")=max("Union") then min("Union") else null end as "Union", case when min("Name")=max("Name") then min("Name") else null end as "Name", sum("Base") as "Base", sum("TCOE") as "TCOE", sum("Rec") as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", 1 as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE" from 'bart-comp-all') where "JobFamily"='Executive Management') group by "Title"))`

const tq = t4 + '\nunion all\n' + t5 + ' order by "_path"'

const main = () => {
  db.open(':memory:')
    .then(() => csvimport.importSqlite(testPath))
    .then(md => {
      console.log('table import complete: ', md.tableName)
      return db.all(tq)
    })
    .then(rows => {
      console.log('read rows from sqlite table.')
      console.table(rows)
    })
    .then(() => db.close())
    .catch(err => {
      console.error('caught exception in promise chain: ', err, err.stack)
    })
}

main()
