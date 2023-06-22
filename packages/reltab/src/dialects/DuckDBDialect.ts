import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "../ColumnType";
import { BaseSQLDialect } from "../BaseSQLDialect";
import { isNode } from "environ";
import { LeafSchemaMap } from "../TableRep";
import { QueryRep } from "../QueryRep";
import { SQLQueryAST, SQLValExp } from "../SQLQuery";

const intCT = new ColumnType("INTEGER", "integer");
const realCT = new ColumnType("DOUBLE", "real");
const textCT = new ColumnType("VARCHAR", "string");
const boolCT = new ColumnType("BOOL", "boolean");

const timestampCT = new ColumnType("TIMESTAMP", "timestamp", {
  stringRender: (val: any) => {
    if (val == null) {
      return "";
    }
    // Don't parse date to keep microsecond accuracy
    return String(val);
  },
});

const blobCT = new ColumnType("BLOB", "blob", {
  stringRender: (val: any) => {
    if (val == null) {
      return "";
    }
    if (isNode() && val instanceof Buffer) {
      return val.toString();
    }
    if (val instanceof Uint8Array) {
      const decoder = new TextDecoder();
      return decoder.decode(val);
    }
    return JSON.stringify(val);
  },
});

export class DuckDBDialectClass extends BaseSQLDialect {
  private static instance: DuckDBDialectClass;
  readonly dialectName: string = "duckdb";
  readonly requireSubqueryAlias: boolean = true;
  readonly coreColumnTypes: CoreColumnTypes = {
    integer: intCT,
    real: realCT,
    string: textCT,
    boolean: boolCT,
  };

  readonly columnTypes: ColumnTypeMap = {
    INTEGER: intCT,
    BIGINT: intCT,
    HUGEINT: intCT,
    DOUBLE: realCT,
    REAL: realCT,
    FLOAT: realCT,
    TEXT: textCT,
    TIMESTAMP: timestampCT,
    VARCHAR: textCT,
    BOOL: boolCT,
    BOOLEAN: boolCT,
    BLOB: blobCT,
  };

  static getInstance(): DuckDBDialectClass {
    if (!DuckDBDialectClass.instance) {
      DuckDBDialectClass.instance = new DuckDBDialectClass();
    }
    return DuckDBDialectClass.instance;
  }

  queryToSql(
    tableMap: LeafSchemaMap,
    query: QueryRep,
    offset?: number,
    limit?: number
  ): SQLQueryAST {

    // Very hacky way to select timestamps as strings to keep microseconds precision
    var ast = super.queryToSql(tableMap, query, offset, limit)
    return {
      ...ast,
      selectStmts: ast.selectStmts.map(s => 
        ({
          ...s,
          selectCols: s.selectCols.map(c => 
            c.colType.kind == "timestamp" && c.colExp.expType == "ColRef"
              ? { 
                colExp: {
                  expType: "AsString",
                  valExp: c.colExp
                } as SQLValExp,
                colType: c.colType,
                as: c.colExp.colName
              }
              : c),            
        }))
    }
  }
}

export const DuckDBDialect = DuckDBDialectClass.getInstance();
