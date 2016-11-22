/**
 * Simple test of sqlite since it is segfault'ing during row inserts...
 */
import * as sqlite3 from 'sqlite3'

const db = new sqlite3.Database(':memory:')
db.serialize(() => {
})
