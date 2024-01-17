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
  LeafSchemaMap,
  Row,
  ColumnMetaMap,
  DataSourceConnection,
  BigQueryDialect,
  DataSourceNode,
  DataSourcePath,
  DbDriver,
  DbDataSource,
  SQLDialect,
  ColumnStatsMap,
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

export class BigQueryDriver implements DbDriver {
  readonly displayName: string;
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = BigQueryDialect;
  projectId: string;
  datasetName: string;
  bigquery: BigQuery;
  bigquery_meta: BigQuery;
  dataset: Dataset;
  tableMap: LeafSchemaMap;

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

  async runSqlQuery(sqlQuery: string): Promise<Row[]> {
    const [dbRows] = await this.bigquery.query({
      query: sqlQuery,
      location: LOCATION,
    });
    const rows = dbRows as Row[];
    return rows;
  }

  async importCsv(pathname: string, metadata: any): Promise<void> {
    const tableName = genTableName(pathname);
    const [job] = await this.dataset.table(tableName).load(pathname, metadata);
    console.log(
      "importCsv: load completed: ",
      JSON.stringify(job, undefined, 2)
    );
  }

  async getTableSchema(tableName: string): Promise<Schema> {
    const [projectId, datasetName, baseTableName] = tableName.split(".");
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
    return schema;
  }

  async getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    // TODO: Implement using one of these techniques:
    // https://stackoverflow.com/questions/35416212/bigquery-get-schema-for-query-without-actually-running-it
    throw new Error(
      "BigQueryDriver.getSqlQuerySchema: base sql queries not supported"
    );
  }

  async getSqlQueryColumnStatsMap(sqlQuery: string): Promise<ColumnStatsMap> {
    return {};
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
    const driver = new BigQueryDriver(connInfo);
    const dsConn = new DbDataSource(driver);
    return dsConn;
  },
};

registerProvider(bigqueryDataSourceProvider);
