import commandLineArgs from "command-line-args";
import getUsage from "command-line-usage";
import log from "electron-log";
import * as logLevel from "loglevel";
import * as reltab from "reltab";
import * as reltabBigQuery from "reltab-bigquery";
import "reltab-bigquery";
import * as reltabSqlite from "reltab-sqlite";
import * as setup from "./setup";
import * as quickStart from "./quickStart";
import * as appMenu from "./appMenu";
import * as appWindow from "./appWindow";
import electron, { contextBridge } from "electron";
import fs from "fs";

const dialog = electron.dialog;
const app = electron.app;

import path from "path";

import pkgInfo from "../package.json";
import {
  getDataSources,
  getConnection,
  DbConnectionKey,
  TableInfo,
  EvalQueryOptions,
  getSourceInfo,
  QueryExp,
  DbConnection,
  TableRep,
} from "reltab";
import { BigQueryConnection } from "reltab-bigquery";

require("console.table"); // Can insert delay in promise chain by:
// delay(amount).then(() => ...)

let delay = (ms: number) => {
  if (ms > 0) {
    log.log("injecting delay of ", ms, " ms");
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
};

export interface EvalQueryRequest {
  query: QueryExp;
  offset?: number;
  limit?: number;
}

const serverEvalQuery = async (
  conn: DbConnection,
  req: EvalQueryRequest
): Promise<TableRep> => {
  try {
    const hrstart = process.hrtime();
    const qp =
      req.offset !== undefined
        ? conn.evalQuery(req.query, req.offset, req.limit)
        : conn.evalQuery(req.query);
    const qres = await qp;
    const [es, ens] = process.hrtime(hrstart);
    log.info("runQuery: evaluated query in %ds %dms", es, ens / 1e6);
    return qres;
    // const serRes = JSON.stringify(res, null, 2);
    // cb(null, serRes);
  } catch (error) {
    log.error("runQuery: ", error, error.stack);
    throw error;
  }
};

type EngineReq<T> = { engine: DbConnectionKey; req: T };
type EngineReqHandler<Req, Resp> = (req: EngineReq<Req>) => Promise<Resp>;

function mkEngineReqHandler<Req, Resp>(
  srvFn: (dbConn: DbConnection, req: Req) => Promise<Resp>
): EngineReqHandler<Req, Resp> {
  const handler = async (ereq: EngineReq<Req>): Promise<Resp> => {
    const { engine, req } = ereq;
    const conn = await getConnection(engine);
    const res = srvFn(conn, req);
    return res;
  };
  return handler;
}

const engineReqEvalQuery = mkEngineReqHandler(serverEvalQuery);

// TODO: clearly nothing EvalQuery-specific here
const remotableEvalQuery = async (
  reqStr: string,
  cb: (res: any, err: any) => void
) => {
  try {
    const ereq = reltab.deserializeQueryReq(reqStr) as any;
    const res = await engineReqEvalQuery(ereq);
    const serRes = JSON.stringify(res, null, 2);
    cb(null, serRes);
  } catch (err) {
    cb(err, null);
  }
};

const getRowCount = async (
  reqStr: string,
  cb: (res: any, err: any) => void
) => {
  try {
    const req = reltab.deserializeQueryReq(reqStr) as any;
    const { engine, query } = req;
    const hrstart = process.hrtime();
    const rtc = await getConnection(engine);
    const rowCount = await rtc.rowCount(query);
    const [es, ens] = process.hrtime(hrstart);
    log.info("getRowCount: evaluated query in %ds %dms", es, ens / 1e6);
    const resObj = {
      rowCount,
    };
    const serRes = JSON.stringify(resObj, null, 2);
    cb(null, serRes);
  } catch (err) {
    log.error("getRowCount: ", err, err.stack);
    cb(err, null);
  }
};

// remotable wrapper around getSourceInfo on a DbConnection:
const dbGetSourceInfo = async (
  reqStr: string,
  cb: (res: any, err: any) => void
) => {
  try {
    const req = JSON.parse(reqStr);
    const hrstart = process.hrtime();
    const { engine, path } = req;
    const rtc = await getConnection(engine);
    const sourceInfo = await rtc.getSourceInfo(path);
    const [es, ens] = process.hrtime(hrstart);
    log.info("dbGetSourceInfo: evaluated query in %ds %dms", es, ens / 1e6);
    const resObj = {
      sourceInfo,
    };
    const serRes = JSON.stringify(resObj, null, 2);
    cb(null, serRes);
  } catch (err) {
    log.error("dbGetSourceInfo: ", err, err.stack);
    cb(err, null);
  }
};

// main server getSourceInfo
const serverGetSourceInfo = async (
  reqStr: string,
  cb: (res: any, err: any) => void
) => {
  try {
    const req = JSON.parse(reqStr);
    const hrstart = process.hrtime();
    const { path } = req;
    const sourceInfo = await getSourceInfo(path);
    const [es, ens] = process.hrtime(hrstart);
    log.info("getSourceInfo: evaluated query in %ds %dms", es, ens / 1e6);
    const resObj = {
      sourceInfo,
    };
    const serRes = JSON.stringify(resObj, null, 2);
    cb(null, serRes);
  } catch (err) {
    log.error("getSourceInfo: ", err, err.stack);
    cb(err, null);
  }
};

const serverGetDataSources = async (
  reqStr: string,
  cb: (res: any, err: any) => void
) => {
  try {
    const req = JSON.parse(reqStr);
    const hrstart = process.hrtime();
    const nodeIds = await getDataSources();
    const [es, ens] = process.hrtime(hrstart);
    log.info("getDataSources: evaluated query in %ds %dms", es, ens / 1e6);
    const resObj = {
      nodeIds,
    };
    const serRes = JSON.stringify(resObj, null, 2);
    cb(null, serRes);
  } catch (err) {
    log.error("getDataSources: ", err, err.stack);
    cb(err, null);
  }
};

const getTableInfo = async (
  reqStr: string,
  cb: (res: any, err: any) => void
) => {
  try {
    const req = JSON.parse(reqStr);
    const hrstart = process.hrtime();
    const { engine, tableName } = req;
    const rtc = await getConnection(engine);
    const tableInfo = await rtc.getTableInfo(req.tableName);
    const [es, ens] = process.hrtime(hrstart);
    log.info("getTableInfo: evaluated query in %ds %dms", es, ens / 1e6);
    const resObj = {
      tableInfo,
    };
    const serRes = JSON.stringify(resObj, null, 2);
    cb(null, serRes);
  } catch (err) {
    log.error("getTableInfo: ", err, err.stack);
    cb(err, null);
  }
};

const covid19ConnKey: DbConnectionKey = {
  providerName: "bigquery",
  connectionInfo: {
    projectId: "bigquery-public-data",
    datasetName: "covid19_jhu_csse",
  },
};
const connOpts: EvalQueryOptions = {
  showQueries: true,
};

const initBigquery = async () => {
  const rtc = (await reltab.getConnection(
    covid19ConnKey
  )) as BigQueryConnection;
};

/*
 * main process initialization
 *
 * invoked via electron remote
 *
 * arguments:
 * targetPath -- filename or sqlite URL we are opening
 * srcfile (optional) -- path we are opening from
 */

const initMainAsync = async (
  options: any,
  targetPath: string,
  srcfile: string
) => {
  console.log("initMainAsync: ", options, targetPath, srcfile);
  let rtOptions: any = {};

  if (options["show-queries"]) {
    rtOptions.showQueries = true;
    // *sigh*: This doesn't seem to propapagate to reltab-sqlite...npm duplication issue?
    logLevel.setLevel(logLevel.levels.INFO);
    log.info("initMainAsync: set log level to INFO");
  }

  await initBigquery();

  let rtc: reltabSqlite.SqliteContext;
  let tableInfo: TableInfo;
  const sqlUrlPrefix = "sqlite://";

  let connKey: DbConnectionKey;

  if (targetPath.startsWith(sqlUrlPrefix)) {
    const urlPath = targetPath.slice(sqlUrlPrefix.length);
    const tableSepIndex = urlPath.lastIndexOf("/");
    const tableName = urlPath.slice(tableSepIndex + 1);
    const dbFileName = urlPath.slice(0, tableSepIndex);
    connKey = {
      providerName: "sqlite",
      connectionInfo: dbFileName,
    };
    console.log("electronMain: connKey: ", connKey);
    rtc = (await getConnection(connKey)) as reltabSqlite.SqliteContext;
    tableInfo = await rtc.getTableInfo(tableName);
  } else {
    connKey = {
      providerName: "sqlite",
      connectionInfo: ":memory:",
    };
    rtc = (await getConnection(connKey)) as reltabSqlite.SqliteContext;
    let pathname = targetPath; // check if pathname exists

    if (!fs.existsSync(pathname)) {
      let found = false;
      let srcdir = null;
      let srcDirTarget = null;
      log.warn("initMain: pathname not found: ", pathname);
      const basename = path.basename(pathname);

      if (srcfile) {
        srcdir = path.dirname(srcfile);
        srcDirTarget = path.join(srcdir, basename);

        if (fs.existsSync(srcDirTarget)) {
          log.warn("initMain: using " + srcDirTarget + " instead");
          pathname = srcDirTarget;
          found = true;
        }
      }

      if (!found) {
        let msg = '"' + pathname + '": file not found.';

        if (srcdir) {
          msg += '\n(Also tried "' + srcDirTarget + '")';
        }

        throw new Error(msg);
      }
    }

    const noHeaderRow = options["no-headers"] || false;
    const md = await reltabSqlite.fastImport(rtc.db, pathname, {
      noHeaderRow,
    });
    // const md = await csvimport.importSqlite(pathname, ',', { noHeaderRow })

    tableInfo = reltabSqlite.mkTableInfo(md);
  }

  rtc.registerTable(tableInfo);

  // Now let's place a function in global so it can be run via remote:
  (global as any).runQuery = remotableEvalQuery;
  (global as any).getRowCount = getRowCount;
  (global as any).getTableInfo = getTableInfo;
  (global as any).dbGetSourceInfo = dbGetSourceInfo;
  (global as any).serverGetSourceInfo = serverGetSourceInfo;
  (global as any).serverGetDataSources = serverGetDataSources;
  (global as any).appRtc = rtc;

  const initInfo = { tableInfo, connKey };
  const initStr = JSON.stringify(initInfo, null, 2);
  console.log("initMainAsync: returning: ", initStr);
  return initStr;
};

const mkInitMain = (options: any) => (
  pathname: string,
  srcfile: string,
  cb: (res: any, err: any) => void
) => {
  initMainAsync(options, pathname, srcfile)
    .then((mdStr) => cb(null, mdStr))
    .catch((err) => cb(err, null));
}; // App initialization:

const appInit = (options: any) => {
  // log.log('appInit: ', options)
  (global as any).initMain = mkInitMain(options);
  (global as any).errorDialog = errorDialog;
  appMenu.createMenu(); // log.log('appInit: done')
};

const optionDefinitions = [
  {
    name: "srcfile",
    type: String,
    defaultOption: true,
    typeLabel:
      "[underline]{file}.csv or [underline]{file}.tad or sqlite://[underline]{file}/[underline]{table}",
    description: "CSV file(.csv with header row), Tad(.tad) file to view",
  },
  {
    name: "executed-from",
    type: String,
    description: "pathname to working directory",
  },
  {
    name: "foreground",
    alias: "f",
    type: Boolean,
    description: "keep in foreground",
  },
  {
    name: "help",
    alias: "h",
    type: Boolean,
    description: "Show usage information",
  },
  {
    name: "hidden-cols",
    type: Boolean,
    description: "Show hidden columns (for debugging)",
  },
  {
    name: "no-headers",
    type: Boolean,
    description: "source file has no header line",
  },
  {
    name: "show-queries",
    type: Boolean,
    description: "Show generated SQL queries on console when in foreground",
  },
  {
    name: "version",
    alias: "v",
    type: Boolean,
    description: "Print version number and exit",
  },
];
const usageInfo = [
  {
    header: "Tad",
    content: "A viewer for tabular data.",
  },
  {
    header: "Synopsis",
    content: [
      "$ tad [[italic]{options}] [underline]{file}.csv",
      "$ tad [[italic]{options}] [underline]{file}.tad",
      "$ tad [[italic]{options}] sqlite://[underline]{/path/to/sqlite-file}/[underline]{table}",
    ],
  },
  {
    header: "Options",
    optionList: optionDefinitions.filter((opt) => opt.name !== "srcfile"),
  },
];

const showVersion = () => {
  const version = pkgInfo.version;
  log.log(version);
};

const showUsage = () => {
  const usage = getUsage(usageInfo);
  log.log(usage);
};

const reportFatalError = (msg: string) => {
  dialog.showErrorBox("Error starting Tad", msg);
  app.quit();
};

const errorDialog = (title: string, msg: string, fatal = false) => {
  dialog.showErrorBox(title, msg);

  if (fatal) {
    app.quit();
  }
}; // construct targetPath based on options:

const getTargetPath = (options: any, filePath: string) => {
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

(global as any).openExample = () => {
  const app = electron.app;
  const appPath = app.getAppPath();
  console.log("appPath: ", appPath);
  const appDir = process.defaultApp ? appPath : path.dirname(appPath);
  const exampleFilePath = path.join(appDir, "examples", "movie_metadata.csv");
  appWindow.create(exampleFilePath);
};

let openFilePath: string | null = null;

// callback for app.makeSingleInstance:
const initApp = (firstInstance: any) => (
  instanceArgv: string[],
  workingDirectory: string | null
) => {
  try {
    let argv = instanceArgv.slice(1);
    let awaitingOpenEvent = false; // macOS OpenWith peculiarity
    // Using context menu on Windows results in invoking .exe with
    // just the filename as argument, no directory passed in and
    // no shell wrapper, hence the check for argv.length > 1 here.
    // deal with weird difference between starting from npm and starting
    // from packaged shell wrapper:
    // Update (5/28/17): See also:
    // https://github.com/electron/electron/issues/4690
    //
    // argv && (argv.length > 1) && !(argv[0].startsWith('--executed-from'))

    if (process.defaultApp) {
      // npm / electron start -- passes '.' as first argument
      argv.unshift("--executed-from");
    } // macOS insanity:  If we're started via Open With..., we get invoked
    // with -psn_0_XXXXX argument; let's just kill it:

    if (
      process.platform === "darwin" &&
      argv &&
      argv.length > 0 &&
      argv[0].startsWith("-psn_")
    ) {
      argv = argv.slice(1);
      awaitingOpenEvent = true;
    }

    const options = commandLineArgs(optionDefinitions, {
      argv,
    });
    let quickExit = false;

    if (options.help) {
      showUsage();
      quickExit = true;
    }

    if (options.version) {
      showVersion();
      quickExit = true;
    }

    if (quickExit) {
      app.quit();
    } else {
      const targetPath = getTargetPath(options, options.srcfile); // set at end of ready event handler:

      let isReady = false; // This method will be called when Electron has finished
      // initialization and is ready to create browser windows.
      // Some APIs can only be used after this event occurs.

      if (firstInstance) {
        const handleOpen = (event: electron.Event, filePath: string) => {
          log.log("handleOpen called!");
          log.warn("got open-file event for: ", filePath);
          event.preventDefault();
          const targetPath = getTargetPath(options, filePath);

          if (isReady) {
            log.warn("open-file: app is ready, opening in new window");
            appWindow.create(targetPath);
          } else {
            openFilePath = targetPath;
            log.warn("open-file: set openFilePath " + targetPath);
          }
        };

        app.on("open-file", handleOpen);
        app.on("open-url", (event, url) => {
          log.warn("got open-url: ", event, url);
          handleOpen(event, url);
        });
        const firstRun = setup.postInstallCheck();
        const showQuickStart = firstRun;
        process.on("uncaughtException", function (error) {
          log.error(error.message);
          log.error(error.stack);
          reportFatalError(error.message);
        }); // Quit when all windows are closed.

        app.on("window-all-closed", function () {
          // On OS X it is common for applications and their menu bar
          // to stay active until the user quits explicitly with Cmd + Q
          if (process.platform !== "darwin") {
            app.quit();
          }
        });
        app.on("activate", function () {
          // On OS X it's common to re-create a window in the app when the
          // dock icon is clicked and there are no other windows open.
        });
        app.on("ready", () => {
          // const startMsg = `pid ${process.pid}: Tad started, version: ${app.getVersion()}`
          // log.log(startMsg)
          // dialog.showMessageBox({ message: startMsg })
          appInit(options);

          if (targetPath) {
            appWindow.create(targetPath);
          }

          if (showQuickStart) {
            quickStart.showQuickStart();
          }

          if (openFilePath) {
            const openMsg = `pid ${process.pid}: Got open-file for ${openFilePath}`;
            log.warn(openMsg);
            appWindow.create(openFilePath); // dialog.showMessageBox({ message: openMsg })
          } else {
            if (!targetPath && !awaitingOpenEvent) {
              app.focus();
              appWindow.openDialog();
            }
          }

          isReady = true;
        });
      } else {
        if (targetPath) {
          appWindow.create(targetPath);
        } else {
          log.warn("initApp called with no targetPath");
          app.focus(); // appWindow.openDialog()
        }
      }
    }
  } catch (err) {
    reportFatalError(err.message);
    log.error("Error: ", err.message);
    log.error(err.stack);
    showUsage();
    app.quit();
  }
};

const main = () => {
  // turn off console logging on win32:
  if (process.platform === "win32") {
    log.transports.file.level = false;
  }

  log.warn("Tad started, argv: ", process.argv);
  const shouldQuit = false; //  const shouldQuit = app.makeSingleInstance(initApp(false))
  //  log.warn('After call to makeSingleInstance: ', shouldQuit)

  if (shouldQuit) {
    app.quit();
  } else {
    // first instance:
    initApp(true)(process.argv, null);
  }
};

main();
