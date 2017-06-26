import { Record, List } from 'immutable'
import Dialect from './Dialect'
import Field from './Field'

class FuncArg extends Record({
  field: undefined,
  expType: 'FuncArg'
}) {
  field: Field
  expType: string
  static dialect: Dialect
}

export default FuncArg
