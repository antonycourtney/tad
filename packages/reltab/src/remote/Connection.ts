import {
  deserializeTableRepJson,
  deserializeTableRepStr,
  QueryExp,
} from "../QueryExp";
import { TableRep, TableInfo } from "../TableRep";
import { SQLDialect } from "../dialect";
import {
  DataSourceProviderName,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
} from "../DataSource";
import { TransportClient } from "./Transport";
import * as log from "loglevel";
import { Result } from "./result";
import { deserializeError } from "serialize-error";

export interface EvalQueryOptions {
  showQueries?: boolean;
}
export const defaultEvalQueryOptions: EvalQueryOptions = {
  showQueries: false,
};

export interface DbConnEvalQueryRequest {
  queryStr: string; // JSON-encoded QueryExp
  offset: number | null;
  limit: number | null;
  options: EvalQueryOptions;
}

export interface DbConnRowCountRequest {
  queryStr: string; // JSON-encoded QueryExp
  options: EvalQueryOptions;
}

export interface DbConnGetTableInfoRequest {
  tableName: string;
}

export interface DbConnGetSourceInfoRequest {
  path: DataSourcePath;
}

/**
 * A local or remote connection to a specific database instance.
 */
export interface DataSourceConnection {
  readonly sourceId: DataSourceId;

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep>;
  rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number>;

  getTableInfo(tableName: string): Promise<TableInfo>;
  getSourceInfo(path: DataSourcePath): Promise<DataSourceNode>;

  getDisplayName(): Promise<string>;
}

export type EngineReq<T> = { engine: DataSourceId; req: T };

// remote invoke a DataSourceConnection member function, using DataSourceId to
// identify the engine:
async function invokeDbFunction<T>(
  tconn: TransportClient,
  engine: DataSourceId,
  methodName: string,
  req: T
): Promise<Result<any>> {
  const ereq: EngineReq<T> = { engine, req };
  const retStr = await tconn.invoke(
    "DataSourceConnection." + methodName,
    JSON.stringify(ereq)
  );
  // We could be more precise and try to only pass results from evalQuery through
  // this, but should be harmless to use this for everything:
  const ret = deserializeTableRepStr(retStr);
  return ret;
}

class RemoteDataSourceConnection implements DataSourceConnection {
  private tconn: TransportClient;
  readonly sourceId: DataSourceId;

  constructor(tconn: TransportClient, sourceId: DataSourceId) {
    this.tconn = tconn;
    this.sourceId = sourceId;
  }

  async getDisplayName(): Promise<string> {
    return "TODO: remote getDisplayName";
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    const req: DbConnEvalQueryRequest = {
      queryStr: JSON.stringify(query),
      offset: offset ? offset : null,
      limit: limit ? limit : null,
      options: options ? options : defaultEvalQueryOptions,
    };
    const ret = await invokeDbFunction(
      this.tconn,
      this.sourceId,
      "evalQuery",
      req
    ).then(decodeResult);
    return ret;
  }

  async rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number> {
    const req: DbConnRowCountRequest = {
      queryStr: JSON.stringify(query),
      options: options ? options : defaultEvalQueryOptions,
    };
    return invokeDbFunction(this.tconn, this.sourceId, "rowCount", req).then(
      decodeResult
    );
  }

  async getTableInfo(tableName: string): Promise<TableInfo> {
    const req: DbConnGetTableInfoRequest = { tableName };
    return invokeDbFunction(
      this.tconn,
      this.sourceId,
      "getTableInfo",
      req
    ).then(decodeResult);
  }

  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    const req: DbConnGetSourceInfoRequest = { path };
    return invokeDbFunction(
      this.tconn,
      this.sourceId,
      "getSourceInfo",
      req
    ).then(decodeResult);
  }
}

/**
 * The ReltabConnection interface is the entry point for client-side access to
 * reltab via some client-specific transport mechanism.
 * The interface provides access to a set of data sources and the ability
 * to obtain a (proxy) DataSourceConnection to those data sources.
 */
export interface ReltabConnection {
  connect(sourceId: DataSourceId): Promise<DataSourceConnection>;

  getDataSources(): Promise<DataSourceId[]>;

  /**
   * Expand an absolute DataSourcePath, rooted in an available Database.
   * @param path Absolute path to data source.
   */
  getSourceInfo(path: DataSourcePath): Promise<DataSourceNode>;
}

async function jsonInvoke(
  tconn: TransportClient,
  functionName: string,
  req: any
): Promise<any> {
  const reqStr = JSON.stringify(req);
  const retStr = await tconn.invoke(functionName, reqStr);
  const ret = JSON.parse(retStr);
  return ret;
}

function decodeResult<T>(res: Result<T>): T {
  switch (res.status) {
    case "Ok":
      return res.value;
    case "Err":
      console.log("decodeResult: got error result: ", res);
      const errVal = deserializeError(res.errVal);
      throw errVal;
  }
}

/**
 * Implementation of ReltabConnection interface using lower level
 * TransportClient remote invocation
 */
export class RemoteReltabConnection implements ReltabConnection {
  private tconn: TransportClient;

  constructor(tconn: TransportClient) {
    this.tconn = tconn;
  }

  async connect(sourceId: DataSourceId): Promise<DataSourceConnection> {
    const conn = new RemoteDataSourceConnection(this.tconn, sourceId);
    return conn;
  }

  async getDataSources(): Promise<DataSourceId[]> {
    const ret = (await jsonInvoke(this.tconn, "getDataSources", {}).then(
      decodeResult
    )) as any;
    return ret["dataSourceIds"];
  }

  /**
   * Expand an absolute DataSourcePath, rooted in an available Database.
   * @param path Absolute path to data source.
   */
  async getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
    const ret = (await jsonInvoke(this.tconn, "getSourceInfo", { path }).then(
      decodeResult
    )) as any;
    return ret["sourceInfo"];
  }
}
