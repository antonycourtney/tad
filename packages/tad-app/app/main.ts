import "source-map-support/register";
import commandLineArgs, { CommandLineOptions } from "command-line-args";
import getUsage from "command-line-usage";
import log from "electron-log";
import * as logLevel from "loglevel";
import * as reltab from "reltab";
import * as reltabBigQuery from "reltab-bigquery";
import "reltab-bigquery";
import * as reltabSqlite from "reltab-sqlite";
import "reltab-sqlite";
import * as reltabDuckDB from "reltab-duckdb";
import "reltab-duckdb";
import * as setup from "./setup";
import * as quickStart from "./quickStart";
import * as appMenu from "./appMenu";
import * as appWindow from "./appWindow";
import electron, { contextBridge, ipcMain } from "electron";
import fs from "fs";

const dialog = electron.dialog;
const app = electron.app;

import path from "path";

import pkgInfo from "../package.json";
import {
  getConnection,
  DbConnectionKey,
  TableInfo,
  EvalQueryOptions,
  QueryExp,
  DbConnection,
  TableRep,
  TransportServer,
  serverInit,
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

class ElectronTransportServer implements TransportServer {
  registerInvokeHandler(
    functionName: string,
    handler: (req: any) => Promise<any>
  ): void {
    // TODO: catch exceptions and map into a serializable failure
    ipcMain.handle(functionName, async (event, req) => handler(req));
  }
}

/*
 * main process initialization
 *
 * invoked via electron remote
 *
 */

// JSON encoded init info to return from initMainAsync
let initStr: string | null = null;

const initMainAsync = async (options: any) => {
  if (initStr !== null) {
    return initStr;
  }
  console.log("initMainAsync: ", options);
  let rtOptions: any = {};

  if (options["show-queries"]) {
    rtOptions.showQueries = true;
    logLevel.setLevel(logLevel.levels.INFO);
    log.info("initMainAsync -- showQueries enabled, set log level to INFO");
  }

  await initBigquery();

  /*
  let rtc: reltabSqlite.SqliteContext;
  let connKey: DbConnectionKey;

  connKey = {
    providerName: "sqlite",
    connectionInfo: ":memory:",
  };
  rtc = (await getConnection(connKey)) as reltabSqlite.SqliteContext;
  */
  let connKey: DbConnectionKey;

  connKey = {
    providerName: "duckdb",
    connectionInfo: ":memory:",
  };
  const rtc = await getConnection(connKey);

  (global as any).appRtc = rtc;

  const ts = new ElectronTransportServer();
  serverInit(ts);

  const initInfo = { connKey };
  initStr = JSON.stringify(initInfo, null, 2);
  return initStr;
};

/*
 * Remotable function to import a CSV file
 */
const importCSV = async (targetPath: string): Promise<string> => {
  let pathname = targetPath;

  // check if pathname exists
  if (!fs.existsSync(pathname)) {
    let msg = '"' + pathname + '": file not found.';
    throw new Error(msg);
  }

  const ctx = (global as any).appRtc as reltabDuckDB.DuckDBContext;
  const tableName = await reltabDuckDB.nativeCSVImport(ctx.db, targetPath);

  return tableName;
};

/*
 * Remotable function to import a CSV file
 */
const importParquet = async (targetPath: string): Promise<string> => {
  let pathname = targetPath;

  // check if pathname exists
  if (!fs.existsSync(pathname)) {
    let msg = '"' + pathname + '": file not found.';
    throw new Error(msg);
  }

  const ctx = (global as any).appRtc as reltabDuckDB.DuckDBContext;
  const tableName = await reltabDuckDB.nativeParquetImport(ctx.db, targetPath);

  return tableName;
};

const importCSVSqlite = async (targetPath: string): Promise<string> => {
  let pathname = targetPath;

  // check if pathname exists
  if (!fs.existsSync(pathname)) {
    let msg = '"' + pathname + '": file not found.';
    throw new Error(msg);
  }

  // TODO:
  //   const noHeaderRow = options["no-headers"] || false;
  const noHeaderRow = false;

  const rtc = (global as any).appRtc as reltabSqlite.SqliteContext;
  const tableName = await reltabSqlite.fastImport(rtc.db, pathname, {
    noHeaderRow,
  });
  return tableName;
};

/*
 * OLD initMain -- will probably have to move some of this initialization to seperate
 * functions exposed remotely:
 */
/*
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
    rtc = (await getConnection(connKey)) as reltabSqlite.SqliteContext;
    tableInfo = await rtc.getTableInfo(tableName);
  } else {
    connKey = {
      providerName: "sqlite",
      connectionInfo: ":memory:",
    };
    rtc = (await getConnection(connKey)) as reltabSqlite.SqliteContext;
    let pathname = targetPath; 
    
    // check if pathname exists
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
    // const md = await csvimport.streamCSVImport(pathname, ',', { noHeaderRow })
  }

  (global as any).appRtc = rtc;

  const ts = new ElectronTransportServer();
  serverInit(ts);

  const initInfo = { connKey };
  const initStr = JSON.stringify(initInfo, null, 2);
  return initStr;
};
*/

const mkInitMain = (options: any) => (cb: (res: any, err: any) => void) => {
  initMainAsync(options)
    .then((mdStr) => cb(null, mdStr))
    .catch((err) => cb(err, null));
}; // App initialization:

const remotableImportCSV = (
  targetPath: string,
  cb: (res: any, err: any) => void
) => {
  importCSV(targetPath)
    .then((tableName) => cb(null, tableName))
    .catch((err) => cb(err, null));
};

const remotableImportParquet = (
  targetPath: string,
  cb: (res: any, err: any) => void
) => {
  importParquet(targetPath)
    .then((tableName) => cb(null, tableName))
    .catch((err) => cb(err, null));
};

const appInit = (options: any) => {
  // log.log('appInit: ', options)
  (global as any).initMain = mkInitMain(options);
  (global as any).importCSV = remotableImportCSV;
  (global as any).importParquet = remotableImportParquet;
  (global as any).errorDialog = errorDialog;
  appMenu.createMenu(); // log.log('appInit: done')
};

const optionDefinitions = [
  {
    name: "srcfile",
    type: String,
    defaultOption: true,
    typeLabel:
      "{underline file}.csv or {underline file}.tad or sqlite://{underline file}/{underline table}",
    description:
      "CSV file(.csv with header row), Tad(.tad) file, Parquet file or sqlite file to view",
  },
  {
    name: "parquet",
    type: Boolean,
    typeLabel: "{underline path}",
    description: "Interpret source path as a Parquet file",
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
      "$ tad [{italic options}] {underline file}.csv",
      "$ tad [{italic options}] {underline file}.tad",
      "$ tad [{italic options}] sqlite://{underline /path/to/sqlite-file}/{underline table}",
      "$ tad [{italic options}] {underline file}.parquet",
      "$ tad [{italic options}] --parquet {underline path}",
    ],
  },
  {
    header: "Options",
    optionList: optionDefinitions.filter((opt) => opt.name !== "srcfile"),
  },
];

const showVersion = () => {
  const version = pkgInfo.version;
  console.log(version);
};

const showUsage = () => {
  const usage = getUsage(usageInfo);
  console.log(usage);
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
};

// construct targetPath based on options:
const getTargetPath = (
  options: any,
  filePath: string | null
): string | null => {
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
  appWindow.create(exampleFilePath, false);
};

let openFilePath: string | null = null;

// callback for app.makeSingleInstance:
const initApp =
  (firstInstance: any) =>
  (instanceArgv: string[], workingDirectory: string | null) => {
    try {
      let argv = instanceArgv.slice(1);
      let awaitingOpenEvent = false;
      // macOS OpenWith peculiarity
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

      let options: CommandLineOptions;
      try {
        options = commandLineArgs(optionDefinitions, {
          argv,
        });
      } catch (argErr) {
        console.error("Error parsing command line arguments: ", argErr.message);
        options = { help: true };
      }
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
        log.log(
          "after arg parsing + getTargetPath:",
          options.srcfile,
          targetPath
        );

        // Set in "ready" event handler:
        let isReady = false;

        if (firstInstance) {
          const handleOpen = (event: electron.Event, filePath: string) => {
            log.log("handleOpen called!");
            log.warn("got open-file event for: ", filePath);
            event.preventDefault();
            const targetPath = getTargetPath(options, filePath);

            if (isReady) {
              log.warn("open-file: app is ready, opening in new window");
              appWindow.create(targetPath, options.parquet);
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
          const showQuickStart = firstRun && setup.runningPackaged();

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

          // This method will be called when Electron has finished
          // initialization and is ready to create browser windows.
          // Some APIs can only be used after this event occurs.
          app.on("ready", () => {
            // const startMsg = `pid ${process.pid}: Tad started, version: ${app.getVersion()}`
            // log.log(startMsg)
            // dialog.showMessageBox({ message: startMsg })
            appInit(options);

            if (targetPath) {
              appWindow.create(targetPath, options.parquet);
            }

            if (showQuickStart) {
              quickStart.showQuickStart();
            }

            if (openFilePath) {
              const openMsg = `pid ${process.pid}: Got open-file for ${openFilePath}`;
              log.warn(openMsg);
              appWindow.create(openFilePath, false); // dialog.showMessageBox({ message: openMsg })
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
            appWindow.create(targetPath, options.parquet);
          } else {
            log.warn("initApp called with no targetPath");
            app.focus();
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
  const shouldQuit = false;
  //  const shouldQuit = app.makeSingleInstance(initApp(false))
  //  log.warn('After call to makeSingleInstance: ', shouldQuit)

  if (shouldQuit) {
    app.quit();
  } else {
    // first instance:
    initApp(true)(process.argv, null);
  }
};

main();
