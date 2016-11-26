/* @flow */
/*
 * Just import our test csv file into sqlite, run a sqlite query, and show results
 */

import 'console.table'
import db from 'sqlite'
import * as csvimport from '../src/csvimport'

const testPath = 'csv/bart-comp-all.csv'

// const tq = 'select * from \'bart-comp-all\' limit 10'
// const tq = 'select * from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", (1) as "Rec", (null) as "_pivot" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE" from (\'bart-comp-all\'))) limit 10'
// const tq = 'select case when min("JobFamily")=max("JobFamily") then min("JobFamily") else null end as "JobFamily", case when min("Title")=max("Title") then min("Title") else null end as "Title", case when min("Union")=max("Union") then min("Union") else null end as "Union", case when min("Name")=max("Name") then min("Name") else null end as "Name", sum("Base") as "Base", sum("TCOE") as "TCOE", sum("Rec") as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", (1) as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE" from (\'bart-comp-all\')))'

// const tq = 'select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec", (null) as "_pivot" from (select case when min("JobFamily")=max("JobFamily") then min("JobFamily") else null end as "JobFamily", case when min("Title")=max("Title") then min("Title") else null end as "Title", case when min("Union")=max("Union") then min("Union") else null end as "Union", case when min("Name")=max("Name") then min("Name") else null end as "Name", sum("Base") as "Base", sum("TCOE") as "TCOE", sum("Rec") as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", (1) as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE" from (\'bart-comp-all\'))))'

const tq = 'select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec", "_pivot", "_depth", (\'hello\' || \'world\') as "_path" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec", "_pivot", (0) as "_depth" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", "Rec", (null) as "_pivot" from (select case when min("JobFamily")=max("JobFamily") then min("JobFamily") else null end as "JobFamily", case when min("Title")=max("Title") then min("Title") else null end as "Title", case when min("Union")=max("Union") then min("Union") else null end as "Union", case when min("Name")=max("Name") then min("Name") else null end as "Name", sum("Base") as "Base", sum("TCOE") as "TCOE", sum("Rec") as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE", (1) as "Rec" from (select "JobFamily", "Title", "Union", "Name", "Base", "TCOE" from (\'bart-comp-all\'))))))'

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
