import * as log from "loglevel";
import { TableRep, QueryExp, Schema, tableQuery } from "reltab";
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

const LOCATION = "US";

function assertDefined<A>(x: A | undefined | null): A {
  if (x == null) {
    throw new Error("unexpected null value");
  }

  return x;
}

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
      log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.debug(sqlQuery);
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
      log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.debug(countSql);
    }

    const t2 = process.hrtime();
    const [dbRows] = await this.bigquery.query({
      query: countSql,
      location: LOCATION,
    });
    const t3 = process.hrtime(t2);
    const [t3s, t3ns] = t3;
    log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
    const ret = Number.parseInt(dbRows[0].rowCount);
    return ret;
  }

  async dbGetTableInfo(
    projectId: string,
    datasetName: string,
    baseTableName: string
  ): Promise<TableInfo> {
    let dataset: Dataset;
    if (projectId === this.projectId && datasetName === this.datasetName) {
      dataset = this.dataset;
    } else {
      const bigquery = new BigQuery({ projectId, location: LOCATION });
      dataset = bigquery.dataset(datasetName);
    }
    const table = dataset.table(baseTableName);
    const [metadata, apiResponse] = await table.getMetadata();
    console.log("metadata: ", JSON.stringify(metadata, null, 2));
    const fields = metadata.schema.fields;
    const columnIds: string[] = fields.map((f: any) => f.name);

    const extendCMap = (
      cmm: ColumnMetaMap,
      field: any,
      idx: number
    ): ColumnMetaMap => {
      const cnm = field.name;
      const cType = field.type.toLocaleLowerCase();

      if (cType == null) {
        log.error(
          'mkTableInfo: No column type for "' + cnm + '", index: ' + idx
        );
      }

      const cmd = {
        displayName: cnm,
        type: assertDefined(cType),
      };
      cmm[cnm] = cmd;
      return cmm;
    };

    const cmMap = fields.reduce(extendCMap, {});
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
