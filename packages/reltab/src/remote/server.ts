/**
 * Top-level, transport-agnostic async entry points for reltab as a
 * remote service.
 */

import * as log from "loglevel";
import * as prettyHRTime from "pretty-hrtime";
import {
  DataSourceConnection,
  EngineReq,
  DbConnEvalQueryRequest,
  DbConnRowCountRequest,
  DbConnGetTableInfoRequest,
  DbConnGetSourceInfoRequest,
} from "./Connection";
import {
  DataSourceProviderName,
  DataSourceId,
  DataSourceNode,
  DataSourcePath,
} from "../DataSource";
import { deserializeQueryReq, QueryExp } from "../QueryExp";
import {
  EncodedRequestHandler,
  TransportClient,
  TransportServer,
} from "./Transport";
import { TableInfo, TableRep } from "../TableRep";
import { Result } from "./result";
import { serializeError } from "serialize-error";

const dbConnEvalQuery = async (
  conn: DataSourceConnection,
  req: DbConnEvalQueryRequest
): Promise<TableRep> => {
  const query = deserializeQueryReq(req.queryStr) as any;
  const hrstart = process.hrtime();
  const offset = req.offset ? req.offset : undefined;
  const limit = req.limit ? req.limit : undefined;
  const options = req.options ? req.options : undefined;
  const qres = await conn.evalQuery(query, offset, limit, options);
  const elapsed = process.hrtime(hrstart);
  log.info("runQuery: evaluated query in  ", prettyHRTime(elapsed));
  const qresStr = JSON.stringify(
    qres,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
  return qres;
};

const dbConnRowCount = async (
  conn: DataSourceConnection,
  req: DbConnRowCountRequest
): Promise<number> => {
  const query = deserializeQueryReq(req.queryStr) as any;
  const hrstart = process.hrtime();
  const count = await conn.rowCount(query, req.options);
  const elapsed = process.hrtime(hrstart);
  log.info("rowCount: evaluated query in", prettyHRTime(elapsed));
  return count;
};

const dbConnGetSourceInfo = async (
  conn: DataSourceConnection,
  req: DbConnGetSourceInfoRequest
): Promise<DataSourceNode> => {
  const hrstart = process.hrtime();
  const { path } = req;
  const sourceInfo = await conn.getSourceInfo(path);
  const elapsed = process.hrtime(hrstart);
  log.info("dbGetSourceInfo: evaluated query in", prettyHRTime(elapsed));
  return sourceInfo;
};

const dbConnGetTableInfo = async (
  conn: DataSourceConnection,
  req: DbConnGetTableInfoRequest
): Promise<TableInfo> => {
  const hrstart = process.hrtime();
  const { tableName } = req;
  const tableInfo = await conn.getTableInfo(tableName);
  const elapsed = process.hrtime(hrstart);
  log.info("dbGetTableInfo: evaluated query in", prettyHRTime(elapsed));
  return tableInfo;
};

// an EngineReqHandler wraps a req in an EngineReq that carries an
// db engine identifier (DataSourceId) that is used to identify
// a particular Db instance for dispatching the Db request.

type EngineReqHandler<Req, Resp> = (req: EngineReq<Req>) => Promise<Resp>;

function mkEngineReqHandler<Req, Resp>(
  srvFn: (dbConn: DataSourceConnection, req: Req) => Promise<Resp>
): EngineReqHandler<Req, Resp> {
  const handler = async (ereq: EngineReq<Req>): Promise<Resp> => {
    const { engine, req } = ereq;
    const dbConn = await getConnection(engine);
    const res = srvFn(dbConn, req);
    return res;
  };
  return handler;
}

const handleDbConnEvalQuery = mkEngineReqHandler(dbConnEvalQuery);
const handleDbConnRowCount = mkEngineReqHandler(dbConnRowCount);
const handleDbConnGetSourceInfo = mkEngineReqHandler(dbConnGetSourceInfo);
const handleDbConnGetTableInfo = mkEngineReqHandler(dbConnGetTableInfo);

export interface DataSourceProvider {
  readonly providerName: DataSourceProviderName;
  connect(resourceId: string): Promise<DataSourceConnection>;
}

let providerRegistry: { [providerName: string]: DataSourceProvider } = {};

// Called during static initialization from linked provider library
export function registerProvider(provider: DataSourceProvider): void {
  providerRegistry[provider.providerName] = provider;
}

let instanceCache: { [key: string]: Promise<DataSourceConnection> } = {};

let resolvedConnections: DataSourceConnection[] = [];

/*
 * internal utility to record a DataSourceConnection in our connection cache
 * when the initial connection promise resolves.
 */
const saveOnResolve = async (
  pconn: Promise<DataSourceConnection>
): Promise<DataSourceConnection> => {
  const c = await pconn;
  resolvedConnections.push(c);
  return c;
};

/**
 * Used to both populate and read from the instance cache
 *
 */
export async function getConnection(
  sourceId: DataSourceId
): Promise<DataSourceConnection> {
  const key = JSON.stringify(sourceId);
  let connPromise: Promise<DataSourceConnection> | undefined;
  connPromise = instanceCache[key];
  if (!connPromise) {
    const { providerName, resourceId } = sourceId;
    let provider: DataSourceProvider | undefined =
      providerRegistry[providerName];

    if (!provider) {
      throw new Error(
        `getConnection: no registered DataSourceProvider for provider name '${providerName}'`
      );
    }
    connPromise = saveOnResolve(provider.connect(resourceId));
    instanceCache[key] = connPromise;
  }
  return connPromise;
}

const connectionNodeId = async (
  conn: DataSourceConnection
): Promise<DataSourceId> => {
  return conn.sourceId;
};

interface GetDataSourcesResult {
  dataSourceIds: DataSourceId[];
}

async function getDataSources(): Promise<DataSourceId[]> {
  const nodeIds: Promise<DataSourceId>[] =
    resolvedConnections.map(connectionNodeId);
  return Promise.all(nodeIds);
}

const handleGetDataSources = async (): Promise<GetDataSourcesResult> => {
  const hrstart = process.hrtime();
  const dataSourceIds = await getDataSources();
  const elapsed = process.hrtime(hrstart);
  log.info("getDataSources: evaluated in  ", prettyHRTime(elapsed));
  const resObj = {
    dataSourceIds,
  };
  return resObj;
};

/**
 * server side of getSourceInfo standalone function, which operates on absolute paths.
 */
async function getSourceInfo(dsPath: DataSourcePath): Promise<DataSourceNode> {
  const { sourceId, path } = dsPath;
  const dbConn = await getConnection(sourceId);
  const sourceInfo = dbConn.getSourceInfo(dsPath);
  return sourceInfo;
}

interface GetSourceInfoRequest {
  path: DataSourcePath;
}

interface GetSourceInfoResult {
  sourceInfo: DataSourceNode;
}

// handler for getSourceInfo
async function handleGetSourceInfo(
  req: GetSourceInfoRequest
): Promise<GetSourceInfoResult> {
  const hrstart = process.hrtime();
  const { path } = req;
  const sourceInfo = await getSourceInfo(path);
  const elapsed = process.hrtime(hrstart);
  log.info("getSourceInfo: evaluated query in", prettyHRTime(elapsed));
  const resObj = {
    sourceInfo,
  };
  return resObj;
}

type AnyReqHandler = (req: any) => Promise<any>;

type ResultReqHandler<T> = (req: any) => Promise<Result<T>>;

const exceptionHandler =
  (hf: AnyReqHandler): ResultReqHandler<any> =>
  async (req: any) => {
    try {
      const value = await hf(req);
      return { status: "Ok", value };
    } catch (errVal) {
      console.error("exceptionHandler caught error: ", errVal);
      return { status: "Err", errVal: serializeError(errVal) };
    }
  };

const simpleJSONHandler =
  (hf: AnyReqHandler): EncodedRequestHandler =>
  async (encodedReq: string): Promise<string> => {
    const req = JSON.parse(encodedReq);
    const resp = await hf(req);
    return JSON.stringify(
      resp,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
  };

export const serverInit = (ts: TransportServer) => {
  ts.registerInvokeHandler(
    "getDataSources",
    simpleJSONHandler(exceptionHandler(handleGetDataSources))
  );
  ts.registerInvokeHandler(
    "getSourceInfo",
    simpleJSONHandler(exceptionHandler(handleGetSourceInfo))
  );
  ts.registerInvokeHandler(
    "DataSourceConnection.evalQuery",
    simpleJSONHandler(exceptionHandler(handleDbConnEvalQuery))
  );
  ts.registerInvokeHandler(
    "DataSourceConnection.rowCount",
    simpleJSONHandler(exceptionHandler(handleDbConnRowCount))
  );
  ts.registerInvokeHandler(
    "DataSourceConnection.getSourceInfo",
    simpleJSONHandler(exceptionHandler(handleDbConnGetSourceInfo))
  );
  ts.registerInvokeHandler(
    "DataSourceConnection.getTableInfo",
    simpleJSONHandler(exceptionHandler(handleDbConnGetTableInfo))
  );
};
