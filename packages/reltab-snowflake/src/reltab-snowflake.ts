import * as log from "loglevel";
import {
  ColumnMetaMap,
  DataSourceConnection,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
  DataSourceProvider,
  DbDataSource,
  DbDriver,
  LeafSchemaMap,
  registerProvider,
  Row,
  Schema,
  SnowflakeDialect,
  SQLDialect,
} from "reltab";

import * as snowflake from "snowflake-sdk";

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

function executeQuery(
  conn: snowflake.Connection,
  sqlText: string
): Promise<any[]> {
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
          resolve(rows!);
        }
      },
    });
  });
}

function typeBaseName(origType: string): string {
  return origType.split("(", 1)[0];
}

async function getSchemaObjects(
  conn: snowflake.Connection,
  dbName: string,
  schemaName: string,
  objectType: string
): Promise<Row[]> {
  const sqlQuery = `SHOW ${objectType} in ${dbName}.${schemaName}`;
  const qres = await executeQuery(conn, sqlQuery);
  const metaRows = qres as Row[];
  return metaRows;
}

export class SnowflakeDriver implements DbDriver {
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = SnowflakeDialect;
  tableMap: LeafSchemaMap;
  snowConn: snowflake.Connection;

  constructor(resourceId: string) {
    this.sourceId = {
      providerName: "snowflake",
      resourceId,
    };
    this.tableMap = {};
    log.debug(
      "creating snowflake connection with: ",
      JSON.stringify(resourceId, null, 2)
    );
    // Enable this for hard-core debugging:
    // snowflake.configure({ logLevel: "TRACE" });
    const connOpts: snowflake.ConnectionOptions = JSON.parse(resourceId);
    this.snowConn = snowflake.createConnection(connOpts);
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

  async runSqlQuery(sqlQuery: string): Promise<Row[]> {
    const qres = await executeQuery(this.snowConn, sqlQuery);
    log.trace("evalQuery: query results: ", JSON.stringify(qres, null, 2));
    const rows = qres as Row[];
    return rows;
  }

  async importCsv(): Promise<void> {
    throw new Error("importCsv not yet implemented for Snowflake");
  }

  async getTableSchema(fullTableName: string): Promise<Schema> {
    const [databaseName, schemaName, tableName] = fullTableName.split(".");
    const sqlQuery = `DESCRIBE TABLE ${databaseName}.${schemaName}.${tableName}`;
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
    return schema;
  }

  async getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    throw new Error(
      "SnowflakeDriver.getSqlQuerySchema: base sql queries not supported"
    );
  }

  async getRootNode(): Promise<DataSourceNode> {
    const rootNode: DataSourceNode = {
      kind: "Database",
      id: "snowflake",
      displayName: "snowflake",
      isContainer: true,
    };
    return rootNode;
  }

  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    const path = dsPath.path;
    let childNodes: DataSourceNode[];
    if (path.length === 1) {
      const sqlQuery = `SHOW databases`;

      const qres = await executeQuery(this.snowConn, sqlQuery);
      const metaRows = qres as Row[];

      childNodes = metaRows.map((row) => ({
        kind: "Database",
        id: row.name as string,
        displayName: row.name as string,
        isContainer: true,
      }));
    } else if (path.length === 2) {
      const dbName = path[1];
      const sqlQuery = `SHOW schemas in ${dbName}`;

      const qres = await executeQuery(this.snowConn, sqlQuery);
      const metaRows = qres as Row[];

      childNodes = metaRows.map((row) => ({
        kind: "Dataset",
        id: row.name as string,
        displayName: row.name as string,
        isContainer: true,
      }));
    } else if (path.length === 3) {
      const [_rootName, dbName, schemaName] = path;

      const tableRows = await getSchemaObjects(
        this.snowConn,
        dbName,
        schemaName,
        "tables"
      );
      const viewRows = await getSchemaObjects(
        this.snowConn,
        dbName,
        schemaName,
        "views"
      );
      const objRows = tableRows.concat(viewRows);

      childNodes = objRows.map((row) => ({
        kind: "Table",
        id: `${row.name}`,
        displayName: row.name as string,
        isContainer: false,
      }));
    } else {
      throw new Error(`getChildren: Unexpected path length: ${path}`);
    }
    return childNodes;
  }
  async getTableName(dsPath: DataSourcePath): Promise<string> {
    const { path } = dsPath;
    if (path.length < 3) {
      throw new Error(`getTableName: non-table path: ${path.toString()}`);
    }
    const tpath = path.slice(1);
    return tpath.join(".");
  }
}

const snowflakeDataSourceProvider: DataSourceProvider = {
  providerName: "snowflake",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    const driver = new SnowflakeDriver(resourceId);
    await driver.connect();
    const dsConn = new DbDataSource(driver);
    return dsConn;
  },
};

registerProvider(snowflakeDataSourceProvider);
