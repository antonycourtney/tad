import { QueryExp } from "./QueryExp";
import { TableRep, TableInfo } from "./TableRep";

export interface Connection {
  // eslint-disable-line
  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number
  ): Promise<TableRep>;
  rowCount(query: QueryExp): Promise<number>;
  getTableInfo(tableName: string): Promise<TableInfo>;
}
