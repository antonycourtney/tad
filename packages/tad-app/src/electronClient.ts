import log from "loglevel";
import * as reltab from "reltab";
import * as electron from "electron";
import {
  TableInfo,
  DataSourcePath,
  DataSourceNode,
  DbConnectionKey,
  ReltabConnection,
  DataSourceNodeId,
  DbConnection,
} from "reltab";

let remoteQuery: any;
let remoteRowCount: any;
let remoteGetTableInfo: any;
let remoteDbGetSourceInfo: any;
let remoteReltabGetSourceInfo: any;
let remoteGetDataSources: any;
let remoteGetDisplayName: any;

class ElectronDbConnection implements DbConnection {
  readonly connectionKey: DbConnectionKey;
  private displayName: string;

  constructor(connectionKey: DbConnectionKey, displayName: string) {
    this.connectionKey = connectionKey;
    this.displayName = displayName;
  }

  async getDisplayName(): Promise<string> {
    return this.displayName;
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    return new Promise((resolve, reject) => {
      let req: Object = { engine: this.connectionKey, tableName };
      const sq = JSON.stringify(req, null, 2);
      remoteGetTableInfo(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = JSON.parse(resStr);
        console.log("getTableInfo returned: ", { resStr, res });
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
      // TODO: should be EvalQueryRequst, not any!
      let evalQueryReq: any = { query };
      if (offset !== -1) {
        evalQueryReq["offset"] = offset;
        evalQueryReq["limit"] = limit;
      }
      let req: any = { engine: this.connectionKey, req: evalQueryReq };
      const sq = JSON.stringify(req, null, 2);
      remoteQuery(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = reltab.deserializeTableRepStr(resStr);
        // console.log("reltab-electron got query result: ");
        // console.log("columns: ", res.schema.columns);
        // console.table(res.rowData);
        resolve(res);
      });
    });
  }

  rowCount(query: reltab.QueryExp): Promise<number> {
    return new Promise((resolve, reject) => {
      let req: Object = { engine: this.connectionKey, query };
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
      let req: Object = { engine: this.connectionKey, path };
      const sq = JSON.stringify(req, null, 2);
      remoteDbGetSourceInfo(sq, (err: any, resStr: string) => {
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

export class ElectronConnection implements ReltabConnection {
  tableName: string;
  tableInfo: TableInfo;

  constructor(tableName: string, tableInfo: TableInfo) {
    this.tableName = tableName;
    this.tableInfo = tableInfo;
    remoteQuery = electron.remote.getGlobal("runQuery");
    remoteRowCount = electron.remote.getGlobal("getRowCount");
    remoteGetTableInfo = electron.remote.getGlobal("getTableInfo");
    remoteDbGetSourceInfo = electron.remote.getGlobal("dbGetSourceInfo");
    remoteReltabGetSourceInfo = electron.remote.getGlobal(
      "serverGetSourceInfo"
    );
    remoteGetDataSources = electron.remote.getGlobal("serverGetDataSources");

    console.log("ElectronConnection: ", { remoteQuery, remoteRowCount });
  }

  async connect(
    connectionKey: DbConnectionKey,
    displayName: string
  ): Promise<DbConnection> {
    return new ElectronDbConnection(connectionKey, displayName);
  }

  async getDataSources(): Promise<DataSourceNodeId[]> {
    return new Promise((resolve, reject) => {
      let req: Object = {};
      const sq = JSON.stringify(req, null, 2);
      remoteGetDataSources(sq, (err: any, resStr: string) => {
        if (err) {
          reject(err);
          return;
        }
        const res = JSON.parse(resStr);
        console.log("getDataSources returned: ", { resStr, res });
        resolve(res.nodeIds as DataSourceNodeId[]);
      });
    });
  }

  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    return new Promise((resolve, reject) => {
      let req: Object = { path };
      const sq = JSON.stringify(req, null, 2);
      remoteReltabGetSourceInfo(sq, (err: any, resStr: string) => {
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
