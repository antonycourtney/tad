import log from "loglevel";
import * as reltab from "reltab";
import { DataSourcePath, DataSourceNode } from "reltab";

async function request(baseUrl: string, path: string, args: any): Promise<any> {
  const url = baseUrl + path;
  const response = await fetch(url, {
    method: "post",
    body: JSON.stringify(args),
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
}

export class ReltabWebConnection implements reltab.Connection {
  baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // import a CSV file, return table name:
  async importFile(fileName: string): Promise<string> {
    const args = { fileName };
    log.debug("importFile: ", args);
    const response = await request(this.baseUrl, "/tadweb/importFile", args);
    log.debug("importFile: got result: ", response);
    return response["tableName"] as string;
  }

  async getTableInfo(tableName: string): Promise<reltab.TableInfo> {
    const args = { tableName };
    log.debug("getTableInfo: ", args);
    const response = await request(this.baseUrl, "/tadweb/getTableInfo", args);
    log.debug("getTableInfo: got result: ", response);
    return response["tableInfo"] as reltab.TableInfo;
  }

  async evalQuery(
    query: reltab.QueryExp,
    offset: number = -1,
    limit: number = -1
  ): Promise<reltab.TableRep> {
    let args: any = { query };
    if (offset !== -1) {
      args.offset = offset;
      args.limit = limit;
    }
    log.debug("evalQuery: ", args);
    const response = await request(this.baseUrl, "/tadweb/evalQuery", args);
    log.debug("evalQuery: got result: ", response);
    const tableRep = reltab.deserializeTableRepJson(response);
    return tableRep;
  }

  async rowCount(query: reltab.QueryExp): Promise<number> {
    let args: any = { query };
    log.debug("rowCount: ", args);
    const response = await request(this.baseUrl, "/tadweb/getRowCount", args);
    log.debug("rowCount: got result: ", response);
    return response["rowCount"] as number;
  }

  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    const args = { path };
    log.debug("getSourceInfo: ", args);
    const response = await request(this.baseUrl, "/tadweb/getSourceInfo", args);
    log.debug("getSourceInfo: got result: ", response);
    return response["sourceInfo"] as reltab.DataSourceNode;
  }
}
