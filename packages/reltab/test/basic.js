/* I would like to use flow type checking on this,
 * but flow seems to want to check all matching fi;es
 * in all directories, and we depend on building ../dist
 * before we can run (or check) this:
 */
import * as reltab from '../dist/index'

const t0 = () => {
  const q1 = reltab.tableQuery('barttest')

  console.log('q1: ', q1)
}

t0()
