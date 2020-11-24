import * as log from "loglevel";
import {
  TableRep,
  QueryExp,
  Schema,
  DbConnection,
  defaultEvalQueryOptions,
  EvalQueryOptions,
  DbProvider,
  registerProvider,
} from "reltab";
import {
  TableInfoMap,
  TableInfo,
  Row,
  ColumnMetaMap,
  DbConnectionKey,
  SnowflakeDialect,
  DataSourceNode,
  DataSourcePath,
} from "reltab";

import * as snowflake from "snowflake-sdk";
import * as path from "path";

function safeGetEnv(varName: string): string {
  const val = process.env[varName];
  if (val === undefined) {
    throw new Error(`required environment variable ${varName} is not defined.`);
  }
  return val;
}

export function getAuthConnectionOptions(): snowflake.ConnectionOptions {
  const connOpts: snowflake.ConnectionOptions = {
    account: safeGetEnv("RELTAB_SNOWFLAKE_ACCOUNT"),
    username: safeGetEnv("RELTAB_SNOWFLAKE_USERNAME"),
    password: safeGetEnv("RELTAB_SNOWFLAKE_PASSWORD"),
  };
  return connOpts;
}

function executeQuery(conn: snowflake.Connection, sqlText: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let stmt = conn.execute({
      sqlText,
      complete: (err, stmt, rows) => {
        if (err) {
          log.error(
            "Failed to execute statement due to the following error: " +
              err.message
          );
          reject(err);
        } else {
          resolve(rows);
        }
      },
    });
  });
}

function typeBaseName(origType: string): string {
  return origType.split("(", 1)[0];
}

export class SnowflakeConnection implements DbConnection {
  readonly connectionKey: DbConnectionKey;
  tableMap: TableInfoMap;
  snowConn: snowflake.Connection;

  constructor(connectionInfo: snowflake.ConnectionOptions) {
    this.connectionKey = {
      providerName: "snowflake",
      connectionInfo
    };
    this.tableMap = {};
    log.debug(
      "creating snowflake connection with: ",
      JSON.stringify(connectionInfo, null, 2)
    );
    // Enable this for hard-core debugging:
    // snowflake.configure({ logLevel: "TRACE" });
    this.snowConn = snowflake.createConnection(connectionInfo);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      log.debug("connect: about to connect to snowflake...");
      try {
        this.snowConn.connect((err, conn) => {
          if (err) {
            log.error("error connecting to Snowflake: ", err.message);
            log.error(err);
            reject(err);
          } else {
            log.debug("succesfully connected to snowflake");
            resolve();
          }
        });
      } catch (connErr) {
        log.error("caught connect error: ", connErr);
        reject(connErr);
      }
    });
  }

  async getDisplayName(): Promise<string> {
    return "Snowflake";
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    const schema = query.getSchema(SnowflakeDialect, this.tableMap);
    const sqlQuery = query.toSql(
      SnowflakeDialect,
      this.tableMap,
      offset,
      limit
    );
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      log.debug("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.info(sqlQuery);
    }

    const t2 = process.hrtime();
    const qres = await executeQuery(this.snowConn, sqlQuery);
    log.trace("evalQuery: query results: ", JSON.stringify(qres, null, 2));
    const rows = qres as Row[];
    const t3 = process.hrtime(t2);
    const [t3s, t3ns] = t3;
    const t4pre = process.hrtime();
    const ret = new TableRep(schema, rows);
    const t4 = process.hrtime(t4pre);
    const [t4s, t4ns] = t4;

    if (trueOptions.showQueries) {
      log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
      log.info("time to mk table rep: %ds %dms", t4s, t4ns / 1e6);
    }

    return ret;
  }

  async rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number> {
    let t0 = process.hrtime();
    const countSql = query.toCountSql(SnowflakeDialect, this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      log.debug("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.info(countSql);
    }

    const t2 = process.hrtime();
    const qres = await executeQuery(this.snowConn, countSql);
    const dbRows = qres as Row[];
    const t3 = process.hrtime(t2);
    const [t3s, t3ns] = t3;
    log.debug("time to run query: %ds %dms", t3s, t3ns / 1e6);
    const ret = dbRows[0].rowCount as number;
    return ret;
  }

  async importCsv(): Promise<void> {
    throw new Error("importCsv not yet implemented for Snowflake");
  }

  private async dbGetTableInfo(tableName: string): Promise<TableInfo> {
    const sqlQuery = `DESCRIBE TABLE ${tableName}`;

    const qres = await executeQuery(this.snowConn, sqlQuery);
    const metaRows = qres as Row[];

    const extendCMap = (cmm: ColumnMetaMap, item: any): ColumnMetaMap => {
      const cnm = item.name as string;
      const cType = typeBaseName(item.type as string);

      const cmd = {
        displayName: cnm,
        columnType: cType,
      };
      cmm[cnm] = cmd;
      return cmm;
    };

    const columnIds = metaRows.map((item: any) => item.name);
    const cmMap = metaRows.reduce(extendCMap, {});
    const schema = new Schema(SnowflakeDialect, columnIds, cmMap);
    return {
      tableName,
      schema,
    };
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    let ti = this.tableMap[tableName];
    if (!ti) {
      ti = await this.dbGetTableInfo(tableName);
      if (ti) {
        this.tableMap[tableName] = ti;
      }
    }
    return ti;
  }

  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    throw new Error("getSourceInfo not yet implemented for Snowflake");
  }
}

const snowflakeDbProvider: DbProvider = {
  providerName: "snowflake",
  connect: async (connectionInfo: any): Promise<DbConnection> => {
    const conn = new SnowflakeConnection(connectionInfo);
    await conn.connect();
    return conn;
  },
};

registerProvider(snowflakeDbProvider);
