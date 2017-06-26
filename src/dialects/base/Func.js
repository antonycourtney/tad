import { Record, List } from 'immutable'
import FuncArg from './FuncArg'
import Dialect from './Dialect'

class Func extends Record({
  name: undefined,
  args: [],
  expType: 'Func'
}) {
  name: string
  args: List<FuncArg>
  expType: string
  static dialect: Dialect
}

export default Func
