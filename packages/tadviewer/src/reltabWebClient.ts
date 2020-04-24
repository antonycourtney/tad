import log from "loglevel";
import * as reltab from "reltab";

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

  async getTableInfo(tableName: string): Promise<reltab.TableInfo> {
    const args = { tableName };
    log.debug("getTableInfo: ", args);
    const response = await request(this.baseUrl, "/tadweb/getTableInfo", args);
    log.debug("getTableInfo: got result: ", JSON.stringify(response, null, 2));
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
    log.debug("evalQuery: got result: ", JSON.stringify(response, null, 2));
    const tableRep = reltab.deserializeTableRepJson(response);
    return tableRep;
  }

  async rowCount(query: reltab.QueryExp): Promise<number> {
    let args: any = { query };
    log.debug("rowCount: ", args);
    const response = await request(this.baseUrl, "/tadweb/getRowCount", args);
    log.debug("rowCount: got result: ", JSON.stringify(response, null, 2));
    return response["rowCount"] as number;
  }
}
