import * as log from "loglevel";
import { TableRep, QueryExp, Schema, tableQuery, ColumnType } from "reltab";
import {
  TableInfoMap,
  TableInfo,
  ValExp,
  Row,
  AggColSpec,
  SubExp,
  ColumnMetaMap,
  ColumnMapInfo,
  Connection,
  BigQueryDialect,
} from "reltab";
import { BigQuery, Dataset } from "@google-cloud/bigquery";
import path = require("path");

const LOCATION = "US";

function assertDefined<A>(x: A | undefined | null): A {
  if (x == null) {
    throw new Error("unexpected null value");
  }

  return x;
}

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

export interface BigQueryConnectionOptions {
  showQueries?: boolean;
}
export class BigQueryConnection implements Connection {
  projectId: string;
  datasetName: string;
  bigquery: BigQuery;
  bigquery_meta: BigQuery;
  dataset: Dataset;
  tableMap: TableInfoMap;
  showQueries: boolean;

  constructor(
    projectId: string,
    datasetName: string,
    options?: BigQueryConnectionOptions
  ) {
    this.projectId = projectId;
    this.datasetName = datasetName;

    this.bigquery = new BigQuery();
    this.bigquery_meta = new BigQuery({ projectId, location: LOCATION });
    this.dataset = this.bigquery_meta.dataset(datasetName);
    this.tableMap = {};
    this.showQueries =
      options != null && options.showQueries != null
        ? options.showQueries
        : false;
  }

  async evalQuery(
    query: QueryExp,
    offset: number = -1,
    limit: number = -1
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    const schema = query.getSchema(this.tableMap);
    const sqlQuery = query.toSql(
      BigQueryDialect.getInstance(),
      this.tableMap,
      offset,
      limit
    );
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
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

    if (this.showQueries) {
      log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
      log.info("time to mk table rep: %ds %dms", t4s, t4ns / 1e6);
    }

    return ret;
  }

  async rowCount(query: QueryExp): Promise<number> {
    let t0 = process.hrtime();
    const countSql = query.toCountSql(
      BigQueryDialect.getInstance(),
      this.tableMap
    );
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
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

    if (this.showQueries) {
      log.info(sqlQuery);
    }

    const [dbRows] = await this.bigquery.query({
      query: sqlQuery,
      location: LOCATION,
    });
    const rows = dbRows as Row[];

    if (this.showQueries) {
      log.info("rows: ", rows);
    }

    const extendCMap = (cmm: ColumnMetaMap, row: Row): ColumnMetaMap => {
      const cnm = row.column_name as string;
      const cType = (row.data_type! as string).toLocaleLowerCase();

      const cmd = {
        displayName: cnm,
        type: assertDefined(cType) as ColumnType, // TODO: this is definitely a lie!
      };
      cmm[cnm] = cmd;
      return cmm;
    };

    const columnIds = rows.map((row) => row.column_name as string);
    const cmMap = rows.reduce(extendCMap, {});
    const schema = new Schema(columnIds, cmMap);
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
}
