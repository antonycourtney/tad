import * as log from "loglevel";
import { TableRep, QueryExp, Schema } from "reltab";
import {
  TableInfoMap,
  TableInfo,
  Row,
  ColumnMetaMap,
  Connection,
  PrestoDialect,
  DataSourceNode,
  DataSourcePath,
} from "reltab";
import * as aws from "aws-sdk";
import * as path from "path";

const AthenaExpress = require("athena-express");

const REGION = "us-west-2";

aws.config.update({ region: REGION });
const athenaExpressConfig = { aws }; //configuring athena-express with aws sdk object
const athenaExpress = new AthenaExpress(athenaExpressConfig);

const mapIdent = (src: string): string => {
  const ret = src.replace(/[^a-z0-9_]/gi, "_");
  return ret;
};

const isAlpha = (ch: string): boolean => /^[A-Z]$/i.test(ch);

export interface BigQueryConnectionOptions {
  showQueries?: boolean;
}
export class AWSAthenaConnection implements Connection {
  tableMap: TableInfoMap;
  showQueries: boolean;

  constructor(options?: BigQueryConnectionOptions) {
    this.tableMap = {};
    this.showQueries =
      options != null && options.showQueries != null
        ? options.showQueries
        : false;
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number
  ): Promise<TableRep> {
    let t0 = process.hrtime();
    const schema = query.getSchema(PrestoDialect, this.tableMap);
    const sqlQuery = query.toSql(PrestoDialect, this.tableMap, offset, limit);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
      log.debug("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.info(sqlQuery);
    }

    const t2 = process.hrtime();
    const qres = await athenaExpress.query(sqlQuery);
    console.log("evalQuery: query results: ", JSON.stringify(qres, null, 2));
    const rows = qres.Items as Row[];
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
    const countSql = query.toCountSql(PrestoDialect, this.tableMap);
    let t1 = process.hrtime(t0);
    const [t1s, t1ns] = t1;

    if (this.showQueries) {
      log.debug("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("SqliteContext.evalQuery: evaluating:");
      log.info(countSql);
    }

    const t2 = process.hrtime();
    const qres = await athenaExpress.query(countSql);
    const dbRows = qres.Items;
    const t3 = process.hrtime(t2);
    const [t3s, t3ns] = t3;
    log.debug("time to run query: %ds %dms", t3s, t3ns / 1e6);
    const ret = Number.parseInt(dbRows[0].rowCount);
    return ret;
  }

  async importCsv(): Promise<void> {
    throw new Error("importCsv not implemented for aws-athena");
  }

  private async dbGetTableInfo(tableName: string): Promise<TableInfo> {
    const sqlQuery = `DESCRIBE ${tableName}`;

    if (this.showQueries) {
      log.info(sqlQuery);
    }

    const qres = await athenaExpress.query(sqlQuery);
    const items = qres.Items; // each item has one key (column name), mapped to its type.

    if (this.showQueries) {
      log.info("items: ", items);
    }

    const extendCMap = (cmm: ColumnMetaMap, item: any): ColumnMetaMap => {
      const cnm = Object.keys(item)[0] as string;
      const cType = (item[cnm] as string).toLocaleUpperCase();

      const cmd = {
        displayName: cnm,
        columnType: cType,
      };
      cmm[cnm] = cmd;
      return cmm;
    };

    const columnIds = items.map((item: any) => Object.keys(item)[0]);
    const cmMap = items.reduce(extendCMap, {});
    const schema = new Schema(PrestoDialect, columnIds, cmMap);
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
    throw new Error("getSourceInfo not yet implemented for aws-athena");
  }
}
