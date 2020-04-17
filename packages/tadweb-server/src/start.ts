import * as express from "express";
import * as log from "loglevel";
import * as commandLineArgs from "command-line-args";
import { AddressInfo } from "net";
import * as path from "path";
import * as reltabSqlite from "reltab-sqlite";
import { SqliteContext } from "reltab-sqlite";
import * as reltab from "reltab";
import { monitorEventLoopDelay } from "perf_hooks";
import { read } from "fs";

const portNumber = 9000;

const optionDefinitions = [
  {
    name: "srcfile",
    type: String,
    defaultOption: true,
    typeLabel:
      "[underline]{file}.csv or [underline]{file}.tad or sqlite://[underline]{file}/[underline]{table}",
    description: "CSV file(.csv with header row), Tad(.tad) file to view",
  },
];

const initSqlite = async (csvFilePath: string): Promise<SqliteContext> => {
  const ctx = (await reltabSqlite.getContext(":memory:")) as SqliteContext;

  const md = await reltabSqlite.fastImport(ctx.db, csvFilePath);
  const ti = reltabSqlite.mkTableInfo(md);
  log.info("imported CSV, table name: ", ti.tableName);
  ctx.registerTable(ti);

  return ctx;
};

// construct targetPath based on options:
const getTargetPath = (
  options: commandLineArgs.CommandLineOptions,
  filePath: string
) => {
  let targetPath = null;
  const srcDir = options["executed-from"];
  if (
    srcDir &&
    filePath &&
    !filePath.startsWith("/") &&
    !filePath.startsWith("sqlite://")
  ) {
    // relative path -- prepend executed-from
    targetPath = path.join(srcDir, filePath);
  } else {
    // absolute pathname or no srcDir:
    targetPath = filePath;
  }
  return targetPath;
};

const handleGetRowCount = async (
  rtc: reltab.Connection,
  req: express.Request,
  res: express.Response
) => {
  try {
    log.info("POST getRowcount: got request: ", req.body);
    // const queryReq = reltab.deserializeQueryReq(req.body); // now done by Express
    const queryReq = req.body;
    const hrstart = process.hrtime();
    const rowCount = await rtc.rowCount(queryReq.query);
    const [es, ens] = process.hrtime(hrstart);
    log.info("getRowCount: evaluated query in %ds %dms", es, ens / 1e6);
    const resObj = { rowCount };
    log.info("sending response: ", resObj);
    res.json(resObj);
  } catch (err) {
    log.error("getRowCount: ", err, err.stack);
    // TODO: return an error
  }
};

const viewerUrl = "/tadviewer/index.html";

const rootRedirect = (req: express.Request, res: express.Response) => {
  res.redirect(viewerUrl);
};

async function main() {
  log.setLevel(log.levels.INFO);
  const options = commandLineArgs(optionDefinitions);

  const targetPath = getTargetPath(options, options.srcfile);

  const dbCtx = await initSqlite(targetPath);

  log.info('reltabSqlite initialized; imported CSV file "' + targetPath + '"');

  let app = express();
  app.use(express.json({ reviver: reltab.queryReviver }));

  // app.get("/", (req, res) => res.send("Hello World!"));
  app.get("/", rootRedirect);

  app.use(express.static("./public"));

  app.post("/tadweb/getRowCount", (req, res) =>
    handleGetRowCount(dbCtx, req, res)
  );

  const server = app.listen(portNumber, () => {
    const addr = server.address() as AddressInfo;
    log.info("Listening on port ", addr.port);
  });
}

main();
