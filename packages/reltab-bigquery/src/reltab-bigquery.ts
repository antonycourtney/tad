import * as log from "loglevel";
import {
  TableRep,
  QueryExp,
  Schema,
  DataSourceId,
  EvalQueryOptions,
  DataSourceProvider,
  defaultEvalQueryOptions,
  registerProvider,
  TableInfoMap,
  TableInfo,
  Row,
  ColumnMetaMap,
  DataSourceConnection,
  BigQueryDialect,
  DataSourceNode,
  DataSourcePath,
} from "reltab";
import { BigQuery, Dataset } from "@google-cloud/bigquery";
import path = require("path");

const LOCATION = "US";

const mapIdent = (src: string): string => {
  const ret = src.replace(/[^a-z0-9_]/gi, "_");
  return ret;
};

const isAlpha = (ch: string): boolean => /^[A-Z]$/i.test(ch);

/* generate a SQL table name from pathname */
const genTableName = (pathname: string): string => {
  const extName = path.extname(pathname);
  const baseName = path.basename(pathname, extName);
  let baseIdent = mapIdent(baseName);
  if (!isAlpha(baseIdent[0])) {
    baseIdent = "t_" + baseIdent;
  }
  const tableName = baseIdent;
  return tableName;
};

interface BigQueryConnectionInfo {
  projectId: string;
  datasetName: string;
}

export class BigQueryConnection implements DataSourceConnection {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  projectId: string;
  datasetName: string;
  bigquery: BigQuery;
  bigquery_meta: BigQuery;
  dataset: Dataset;
  tableMap: TableInfoMap;

  constructor(connectionInfo: BigQueryConnectionInfo) {
    const { projectId, datasetName } = connectionInfo;
    const resourceId = JSON.stringify(connectionInfo);
    this.displayName = `bigquery: ${projectId}`;
    this.sourceId = {
      providerName: "bigquery",
      resourceId,
    };
    this.projectId = projectId;
    this.datasetName = datasetName;

    this.bigquery = new BigQuery();
    this.bigquery_meta = new BigQuery({ projectId, location: LOCATION });
    this.dataset = this.bigquery_meta.dataset(datasetName);
    this.tableMap = {};
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  // ensure every table mentioned in query is registered:
  async ensureTables(query: QueryExp): Promise<void> {
    const tblNames = query.getTables();
    const namesArr = Array.from(tblNames);
    for (let tblName of namesArr) {
      if (this.tableMap[tblName] === undefined) {
        await this.getTableInfo(tblName);
      }
    }
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    await this.ensureTables(query);
    const schema = query.getSchema(BigQueryDialect, this.tableMap);
    const sqlQuery = query.toSql(BigQueryDialect, this.tableMap, offset, limit);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      log.debug("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.info(sqlQuery);
    }

    const t2 = process.hrtime();
    const [dbRows] = await this.bigquery.query({
      query: sqlQuery,
      location: LOCATION,
    });
    const rows = dbRows as Row[];
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
    await this.ensureTables(query);

    const countSql = query.toCountSql(BigQueryDialect, this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      log.debug("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.info(countSql);
    }

    const t2 = process.hrtime();
    const [dbRows] = await this.bigquery.query({
      query: countSql,
      location: LOCATION,
    });
    const t3 = process.hrtime(t2);
    const [t3s, t3ns] = t3;
    log.debug("time to run query: %ds %dms", t3s, t3ns / 1e6);
    const ret = Number.parseInt(dbRows[0].rowCount);
    return ret;
  }

  async importCsv(pathname: string, metadata: any): Promise<void> {
    const tableName = genTableName(pathname);
    const [job] = await this.dataset.table(tableName).load(pathname, metadata);
    console.log(
      "importCsv: load completed: ",
      JSON.stringify(job, undefined, 2)
    );
  }

  private async dbGetTableInfo(
    projectId: string,
    datasetName: string,
    baseTableName: string
  ): Promise<TableInfo> {
    const sqlQuery = `SELECT column_name, data_type FROM \`${projectId}.${datasetName}\`.INFORMATION_SCHEMA.COLUMNS WHERE table_name="${baseTableName}"`;

    const [dbRows] = await this.bigquery.query({
      query: sqlQuery,
      location: LOCATION,
    });
    const rows = dbRows as Row[];

    const extendCMap = (cmm: ColumnMetaMap, row: Row): ColumnMetaMap => {
      const cnm = row.column_name as string;
      const cType = (row.data_type! as string).toLocaleUpperCase();

      const cmd = {
        displayName: cnm,
        columnType: cType,
      };
      cmm[cnm] = cmd;
      return cmm;
    };

    const columnIds = rows.map((row) => row.column_name as string);
    const cmMap = rows.reduce(extendCMap, {});
    const schema = new Schema(BigQueryDialect, columnIds, cmMap);
    return {
      tableName: projectId + "." + datasetName + "." + baseTableName,
      schema,
    };
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    let ti = this.tableMap[tableName];
    if (!ti) {
      const [projectId, datasetName, baseTableName] = tableName.split(".");
      ti = await this.dbGetTableInfo(projectId, datasetName, baseTableName);
      if (ti) {
        this.tableMap[tableName] = ti;
      }
    }
    return ti;
  }

  async getRootNode(): Promise<DataSourceNode> {
    const rootNode: DataSourceNode = {
      id: this.projectId,
      kind: "Database",
      displayName: this.projectId,
      isContainer: true,
    };
    return rootNode;
  }

  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    const path = dsPath.path;
    let childNodes: DataSourceNode[];
    if (path.length === 1) {
      // Enumerate datasets and get their ids:
      const [datasets] = await this.bigquery_meta.getDatasets();
      childNodes = await Promise.all(
        datasets.map(async (dataset) => {
          const datasetName = dataset.id!;
          // get metadata on dataset for description:
          const [dsInfo] = await dataset.get();
          // And enumerate tables:
          const node: DataSourceNode = {
            id: datasetName,
            kind: "Dataset",
            displayName: datasetName,
            description: dsInfo.metadata.description,
            isContainer: true,
          };
          return node;
        })
      );
    } else if (path.length == 2) {
      const [dbName, datasetName] = path;
      const dataset = this.bigquery_meta.dataset(datasetName);
      // And enumerate tables:
      const [tables] = await dataset.getTables();
      childNodes = tables.map((table) => ({
        id: table.id!,
        kind: "Table",
        displayName: table.id!,
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
    const [_, datasetName, baseTableName] = path;
    const projectId = this.projectId;
    return `${projectId}.${datasetName}.${baseTableName}`;
  }
}

const bigqueryDataSourceProvider: DataSourceProvider = {
  providerName: "bigquery",
  connect: async (resourceId: string): Promise<DataSourceConnection> => {
    const connInfo = JSON.parse(resourceId);
    const conn = new BigQueryConnection(connInfo);
    return conn;
  },
};

registerProvider(bigqueryDataSourceProvider);
