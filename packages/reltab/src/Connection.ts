import { QueryExp } from "./QueryExp";
import { TableRep, TableInfo } from "./TableRep";
import { SQLDialect } from "./dialect";

export interface Connection {
  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number
  ): Promise<TableRep>;
  rowCount(query: QueryExp): Promise<number>;
  getTableInfo(tableName: string): Promise<TableInfo>;
}
