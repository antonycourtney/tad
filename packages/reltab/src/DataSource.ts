/**
 * Hierarchical organization of data sources.
 */

import { SQLDialect } from "./dialect";
import { QueryExp } from "./QueryExp";
import { defaultEvalQueryOptions } from "./remote/Connection";
import { Schema } from "./Schema";
import { Row, LeafSchemaMap, TableRep } from "./TableRep";
import * as log from "loglevel";
import { QueryLeafDep, TableQueryRep } from "./QueryRep";

export type DataSourceKind =
  | "DataSource"
  | "Database"
  | "Dataset"
  | "Table"
  | "Directory"
  | "File";

// Static registry of globally unique DataSourceProvider names:
export type DataSourceProviderName =
  | "aws-athena"
  | "bigquery"
  | "duckdb"
  | "sqlite"
  | "snowflake"
  | "localfs"
  | "motherduck";

export interface DataSourceId {
  providerName: DataSourceProviderName;
  resourceId: string; // A provider-specific string to identify the data source (':memory', path to a directory or file, etc)
}

export interface DataSourcePath {
  sourceId: DataSourceId;
  path: string[];
}

export interface DataSourceNode {
  id: string; // component of DataSourcePath.path, or fully qualified name for leaf nodes
  kind: DataSourceKind;
  displayName: string;
  description?: string;
  isContainer: boolean; // true iff this node can have children
}

export interface EvalQueryOptions {
  showQueries?: boolean;
}

/**
 * A driver for a particular database, capable of
 * executing SQL queries, obtaining schema info
 * for tables and queries, and enumerating
 * data catalog information
 */
export interface DbDriver {
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect;

  runSqlQuery(sqlQuery: string): Promise<Row[]>;
  getTableSchema(tableName: string): Promise<Schema>;
  getSqlQuerySchema(sqlQuery: string): Promise<Schema>;

  getRootNode(): Promise<DataSourceNode>;
  getChildren(path: DataSourcePath): Promise<DataSourceNode[]>;

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string>;

  // display name for this connection
  getDisplayName(): Promise<string>;
}

/**
 * A local or remote connection to a data source.
 */
export interface DataSourceConnection {
  readonly sourceId: DataSourceId;

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep>;
  rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number>;

  getTableSchema(tableName: string): Promise<Schema>;

  getRootNode(): Promise<DataSourceNode>;
  getChildren(path: DataSourcePath): Promise<DataSourceNode[]>;

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string>;

  // display name for this connection
  getDisplayName(): Promise<string>;
}

/**
 * The standard implementation of DataSourceConnection interface,
 * backed by an underlying DbDriver.
 */
export class DbDataSource implements DataSourceConnection {
  readonly sourceId: DataSourceId;

  readonly db: DbDriver;
  private tableMap: LeafSchemaMap;

  constructor(db: DbDriver) {
    this.db = db;
    this.sourceId = db.sourceId;
    this.tableMap = {};
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    await this.ensureLeafDeps(query);
    const schema = query.getSchema(this.db.dialect, this.tableMap);
    const sqlQuery = query.toSql(this.db.dialect, this.tableMap, offset, limit);

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.info("DuckDBContext.evalQuery: evaluating:\n" + sqlQuery);
    }

    const rows = await this.db.runSqlQuery(sqlQuery);
    const ret = new TableRep(schema, rows);

    /*
    if (this.showQueries) {
      log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
      log.info("time to mk table rep: %ds %dms", t4s, t4ns / 1e6);
    }
    */

    return ret;
  }

  async rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number> {
    await this.ensureLeafDeps(query);
    const countSql = query.toCountSql(this.db.dialect, this.tableMap);

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("DuckDBContext.rowCount: evaluating: \n" + countSql);
    }

    const rows = await this.db.runSqlQuery(countSql);
    let rowCount = rows[0].rowCount as number;
    if (typeof rowCount === "bigint") {
      const rcVal = rowCount as bigint;
      rowCount = Number.parseInt(rcVal.toString());
    }
    return rowCount;
  }

  // ensure every table (or base query) mentioned in query is registered:
  async ensureLeafDeps(query: QueryExp): Promise<void> {
    const leafDepsMap = query.getLeafDeps();
    for (const [leafKey, leafQuery] of leafDepsMap.entries()) {
      if (this.tableMap[leafKey] === undefined) {
        await this.getLeafDepSchema(leafKey, leafQuery);
      }
    }
  }

  async getLeafDepSchema(
    leafKey: string,
    leafQuery: QueryLeafDep
  ): Promise<Schema> {
    let schema: Schema | undefined = this.tableMap[leafKey];
    if (!schema) {
      switch (leafQuery.operator) {
        case "table":
          schema = await this.db.getTableSchema(leafQuery.tableName);
          break;
        case "sql":
          schema = await this.db.getSqlQuerySchema(leafQuery.sqlQuery);
          break;
        default:
          const invalidQuery: never = leafQuery;
          throw new Error(
            "getLeafDepInfo: Unknown operator for leaf query: " + leafQuery
          );
      }
      if (schema) {
        this.tableMap[leafKey] = schema;
      }
    }
    return schema;
  }

  async getSchema(query: QueryExp): Promise<Schema> {
    await this.ensureLeafDeps(query);
    const schema = query.getSchema(this.db.dialect, this.tableMap);
    return schema;
  }

  getTableSchema(tableName: string): Promise<Schema> {
    const leafDep: TableQueryRep = { operator: "table", tableName };
    const leafKey = JSON.stringify(leafDep);
    return this.getLeafDepSchema(leafKey, leafDep);
  }

  getRootNode(): Promise<DataSourceNode> {
    return this.db.getRootNode();
  }

  getChildren(path: DataSourcePath): Promise<DataSourceNode[]> {
    return this.db.getChildren(path);
  }

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string> {
    return this.db.getTableName(path);
  }

  // display name for this connection
  getDisplayName(): Promise<string> {
    return this.db.getDisplayName();
  }
}

export interface DataSourceProvider {
  readonly providerName: DataSourceProviderName;
  connect(resourceId: string): Promise<DataSourceConnection>;
}
