import log from "loglevel";
import * as reltab from "reltab";
import * as electron from "electron";
import { TableInfo, DataSourcePath, DataSourceNode } from "reltab";

let remoteQuery: any;
let remoteRowCount: any;
let remoteGetSourceInfo: any;
let remoteGetTableInfo: any;

export class ElectronConnection implements reltab.Connection {
  tableName: string;
  tableInfo: TableInfo;

  constructor(tableName: string, tableInfo: TableInfo) {
    this.tableName = tableName;
    this.tableInfo = tableInfo;
    remoteQuery = electron.remote.getGlobal("runQuery");
    remoteRowCount = electron.remote.getGlobal("getRowCount");
    remoteGetSourceInfo = electron.remote.getGlobal("getSourceInfo");
    remoteGetTableInfo = electron.remote.getGlobal("getTableInfo");
    console.log("ElectronConnection: ", { remoteQuery, remoteRowCount });
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    return new Promise((resolve, reject) => {
      let req: Object = { tableName };
      const sq = JSON.stringify(req, null, 2);
      remoteGetTableInfo(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = JSON.parse(resStr);
        console.log("getSourceInfo returned: ", { resStr, res });
        resolve(res.tableInfo as TableInfo);
      });
    });
  }

  evalQuery(
    query: reltab.QueryExp,
    offset: number = -1,
    limit: number = -1
  ): Promise<reltab.TableRep> {
    return new Promise((resolve, reject) => {
      let req: any = { query };
      if (offset !== -1) {
        req["offset"] = offset;
        req["limit"] = limit;
      }
      const sq = JSON.stringify(req, null, 2);
      remoteQuery(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = reltab.deserializeTableRepStr(resStr);
        console.log("reltab-electron got query result: ");
        console.log("columns: ", res.schema.columns);
        console.table(res.rowData);
        resolve(res);
      });
    });
  }

  rowCount(query: reltab.QueryExp): Promise<number> {
    return new Promise((resolve, reject) => {
      let req: Object = { query };
      const sq = JSON.stringify(req, null, 2);
      remoteRowCount(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = JSON.parse(resStr);
        console.log("remoteRowCount returned: ", { resStr, res });
        resolve(res.rowCount);
      });
    });
  }

  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    return new Promise((resolve, reject) => {
      let req: Object = { path };
      const sq = JSON.stringify(req, null, 2);
      remoteGetSourceInfo(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = JSON.parse(resStr);
        console.log("getSourceInfo returned: ", { resStr, res });
        resolve(res.sourceInfo as DataSourceNode);
      });
    });
  }
}
