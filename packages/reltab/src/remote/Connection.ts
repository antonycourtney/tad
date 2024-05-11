import { ColumnStatsMap } from "../ColumnStats";
import {
  DataSourceConnection,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
  EvalQueryOptions,
} from "../DataSource";
import { deserializeTableRepStr, QueryExp } from "../QueryExp";
import { Schema } from "../Schema";
import { TableRep } from "../TableRep";
import { deserializeError } from "./errorUtils";
import { Result } from "./result";
import { TransportClient } from "./Transport";

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

export interface DbConnGetTableSchemaRequest {
  tableName: string;
}

export interface DbConnGetColumnStatsMapRequest {
  queryStr: string; // JSON-encoded QueryExp
}

export interface DbConnGetChildrenRequest {
  path: DataSourcePath;
}

export interface DbConnGetTableNameRequest {
  path: DataSourcePath;
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

  async getTableSchema(tableName: string): Promise<Schema> {
    const req: DbConnGetTableSchemaRequest = { tableName };
    return invokeDbFunction(
      this.tconn,
      this.sourceId,
      "getTableSchema",
      req
    ).then(decodeResult);
  }

  async getColumnStatsMap(query: QueryExp): Promise<ColumnStatsMap> {
    const req: DbConnGetColumnStatsMapRequest = {
      queryStr: JSON.stringify(query),
    };
    return invokeDbFunction(
      this.tconn,
      this.sourceId,
      "getColumnStatsMap",
      req
    ).then(decodeResult);
  }

  async getRootNode(): Promise<DataSourceNode> {
    return invokeDbFunction(this.tconn, this.sourceId, "getRootNode", {}).then(
      decodeResult
    );
  }

  async getChildren(path: DataSourcePath): Promise<DataSourceNode[]> {
    const req: DbConnGetChildrenRequest = { path };
    return invokeDbFunction(this.tconn, this.sourceId, "getChildren", req).then(
      decodeResult
    );
  }

  async getTableName(path: DataSourcePath): Promise<string> {
    const req: DbConnGetTableNameRequest = { path };
    return invokeDbFunction(
      this.tconn,
      this.sourceId,
      "getTableName",
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

async function decodeResult<T>(res: Result<T>): Promise<T> {
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
}
