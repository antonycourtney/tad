import Schema from './Schema'
import { Scalar } from '../base'

type Row = {[columnId: string]: Scalar}

class TableRep {
  schema: Schema
  rowData: Array<Row>

  constructor (schema: Schema, rowData: Array<Row>) {
    this.schema = schema
    this.rowData = rowData
  }

  getRow (row: number): Row {
    return this.rowData[ row ]
  }

  getColumn (columnId: string): Array<any> {
    const meta = this.schema.getField(columnId)
    if (meta === undefined) {
      throw new Error('TableRep.getColumn: no such column "' + columnId + '"')
    }
    return this.rowData.map(r => r[columnId])
  }
}

export default TableRep
