/**
 * Top-level, transport-agnostic async entry points for reltab as a
 * remote service.
 */

import * as log from "loglevel";
import {
  DbConnection,
  DbConnectionKey,
  DbProviderName,
  EngineReq,
  DbConnEvalQueryRequest,
  DbConnRowCountRequest,
  DbConnGetTableInfoRequest,
  DbConnGetSourceInfoRequest,
} from "./Connection";
import {
  DataSourceNode,
  DataSourceNodeId,
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
  conn: DbConnection,
  req: DbConnEvalQueryRequest
): Promise<TableRep> => {
  const query = deserializeQueryReq(req.queryStr) as any;
  const hrstart = process.hrtime();
  const offset = req.offset ? req.offset : undefined;
  const limit = req.limit ? req.limit : undefined;
  const options = req.options ? req.options : undefined;
  const qres = await conn.evalQuery(query, offset, limit, options);
  const [es, ens] = process.hrtime(hrstart);
  log.info("runQuery: evaluated query in %ds %dms", es, ens / 1e6);
  const qresStr = JSON.stringify(qres, null, 2);
  return qres;
};

const dbConnRowCount = async (
  conn: DbConnection,
  req: DbConnRowCountRequest
): Promise<number> => {
  const query = deserializeQueryReq(req.queryStr) as any;
  const hrstart = process.hrtime();
  const count = await conn.rowCount(query, req.options);
  const [es, ens] = process.hrtime(hrstart);
  log.info("rowCount: evaluated query in %ds %dms", es, ens / 1e6);
  return count;
};

const dbConnGetSourceInfo = async (
  conn: DbConnection,
  req: DbConnGetSourceInfoRequest
): Promise<DataSourceNode> => {
  const hrstart = process.hrtime();
  const { path } = req;
  const sourceInfo = await conn.getSourceInfo(path);
  const [es, ens] = process.hrtime(hrstart);
  log.info("dbGetSourceInfo: evaluated query in %ds %dms", es, ens / 1e6);
  return sourceInfo;
};

const dbConnGetTableInfo = async (
  conn: DbConnection,
  req: DbConnGetTableInfoRequest
): Promise<TableInfo> => {
  const hrstart = process.hrtime();
  const { tableName } = req;
  const tableInfo = await conn.getTableInfo(tableName);
  const [es, ens] = process.hrtime(hrstart);
  log.info("dbGetTableInfo: evaluated query in %ds %dms", es, ens / 1e6);
  return tableInfo;
};

// an EngineReqHandler wraps a req in an EngineReq that carries an
// db engine identifier (DbConnectionKey) that is used to identify
// a particular Db instance for dispatching the Db request.

type EngineReqHandler<Req, Resp> = (req: EngineReq<Req>) => Promise<Resp>;

function mkEngineReqHandler<Req, Resp>(
  srvFn: (dbConn: DbConnection, req: Req) => Promise<Resp>
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

export interface DbProvider {
  readonly providerName: DbProviderName;
  connect(connectionInfo: any): Promise<DbConnection>;
}

let providerRegistry: { [providerName: string]: DbProvider } = {};

// Called during static initialization from linked provider library
export function registerProvider(provider: DbProvider): void {
  providerRegistry[provider.providerName] = provider;
}

let instanceCache: { [key: string]: Promise<DbConnection> } = {};

let resolvedConnections: DbConnection[] = [];

/*
 * internal utility to record a DbConnection in our connection cache
 * when the initial connection promise resolves.
 */
const saveOnResolve = async (
  pconn: Promise<DbConnection>
): Promise<DbConnection> => {
  const c = await pconn;
  resolvedConnections.push(c);
  return c;
};

/**
 * Used to both populate and read from the instance cache
 *
 */
export async function getConnection(
  connKey: DbConnectionKey
): Promise<DbConnection> {
  const key = JSON.stringify(connKey);
  let connPromise: Promise<DbConnection> | undefined;
  connPromise = instanceCache[key];
  if (!connPromise) {
    const { providerName, connectionInfo } = connKey;
    let provider: DbProvider | undefined = providerRegistry[providerName];

    if (!provider) {
      throw new Error(
        `getConnection: no registered DbProvider for provider name '${providerName}'`
      );
    }
    connPromise = saveOnResolve(provider.connect(connectionInfo));
    instanceCache[key] = connPromise;
  }
  return connPromise;
}

const connectionNodeId = async (
  conn: DbConnection
): Promise<DataSourceNodeId> => {
  const displayName = await conn.getDisplayName();
  const nodeId: DataSourceNodeId = {
    kind: "Database",
    displayName,
    id: conn.connectionKey,
  };
  return nodeId;
};

interface GetDataSourcesResult {
  nodeIds: DataSourceNodeId[];
}

async function getDataSources(): Promise<DataSourceNodeId[]> {
  const nodeIds: Promise<DataSourceNodeId>[] = resolvedConnections.map(
    connectionNodeId
  );
  return Promise.all(nodeIds);
}

const handleGetDataSources = async (): Promise<GetDataSourcesResult> => {
  const hrstart = process.hrtime();
  const nodeIds = await getDataSources();
  const [es, ens] = process.hrtime(hrstart);
  log.info("getDataSources: evaluated in %ds %dms", es, ens / 1e6);
  const resObj = {
    nodeIds,
  };
  return resObj;
};

/**
 * server side of getSourceInfo standalone function, which operates on absolute paths.
 */
async function getSourceInfo(path: DataSourcePath): Promise<DataSourceNode> {
  if (path.length < 1) {
    throw new Error("getSourceInfo: empty path argument");
  }
  const rootNodeId = path[0];
  if (rootNodeId.kind !== "Database") {
    throw new Error(
      `getSourceInfo: Expected Database as first path component, found ${rootNodeId.kind}.\n  full path: {$path}`
    );
  }
  const dbConn = await getConnection(rootNodeId.id);
  const relPath = path.slice(1);
  const sourceInfo = dbConn.getSourceInfo(relPath);
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
  const [es, ens] = process.hrtime(hrstart);
  log.info("getSourceInfo: evaluated query in %ds %dms", es, ens / 1e6);
  const resObj = {
    sourceInfo,
  };
  return resObj;
}

type AnyReqHandler = (req: any) => Promise<any>;

type ResultReqHandler<T> = (req: any) => Promise<Result<T>>;

const exceptionHandler = (hf: AnyReqHandler): ResultReqHandler<any> => async (
  req: any
) => {
  try {
    const value = await hf(req);
    return { status: "Ok", value };
  } catch (errVal) {
    console.error("exceptionHandler caught error: ", errVal);
    return { status: "Err", errVal: serializeError(errVal) };
  }
};

const simpleJSONHandler = (hf: AnyReqHandler): EncodedRequestHandler => async (
  encodedReq: string
): Promise<string> => {
  const req = JSON.parse(encodedReq);
  const resp = await hf(req);
  return JSON.stringify(resp, null, 2);
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
    "DbConnection.evalQuery",
    simpleJSONHandler(exceptionHandler(handleDbConnEvalQuery))
  );
  ts.registerInvokeHandler(
    "DbConnection.rowCount",
    simpleJSONHandler(exceptionHandler(handleDbConnRowCount))
  );
  ts.registerInvokeHandler(
    "DbConnection.getSourceInfo",
    simpleJSONHandler(exceptionHandler(handleDbConnGetSourceInfo))
  );
  ts.registerInvokeHandler(
    "DbConnection.getTableInfo",
    simpleJSONHandler(exceptionHandler(handleDbConnGetTableInfo))
  );
};
