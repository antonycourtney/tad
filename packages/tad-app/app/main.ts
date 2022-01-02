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
import * as reltabFS from "reltab-fs";
import "reltab-fs";
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
  DataSourceId,
  EvalQueryOptions,
  TransportServer,
  serverInit,
  DataSourcePath,
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

const covid19ConnKey: DataSourceId = {
  providerName: "bigquery",
  resourceId: JSON.stringify({
    projectId: "bigquery-public-data",
    datasetName: "covid19_jhu_csse",
  }),
};
const connOpts: EvalQueryOptions = {
  showQueries: true,
};

const initBigquery = async () => {
  const rtc = await reltab.getConnection(covid19ConnKey);
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

let mainInitialized = false;

const initMainAsync = async (options: any): Promise<void> => {
  if (mainInitialized) {
    return;
  }
  let rtOptions: any = {};

  if (options["show-queries"]) {
    rtOptions.showQueries = true;
    logLevel.setLevel(logLevel.levels.INFO);
    log.info("initMainAsync -- showQueries enabled, set log level to INFO");
  }
  log.debug("initMainAsync: ", options);

  // await initBigquery();

  /*
  let rtc: reltabSqlite.SqliteContext;
  let connKey: DataSourceId;

  connKey = {
    providerName: "sqlite",
    resourceId: ":memory:",
  };
  rtc = (await getConnection(connKey)) as reltabSqlite.SqliteContext;
  */
  let connKey: DataSourceId;

  /*
  connKey = {
    providerName: "duckdb",
    resourceId: ":memory:",
  };
  */

  /*
  connKey = {
    providerName: "localfs",
    resourceId: "",
  };
  const rtc = await getConnection(connKey);

  (global as any).appRtc = rtc;
  */
  const ts = new ElectronTransportServer();
  serverInit(ts);

  mainInitialized = true;
};

const newWindowFromDSPath = async (path: DataSourcePath) => {
  await appWindow.createFromDSPath(path);
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

const remotableNewWindowFromDSPath = (
  dsPathStr: string,
  cb: (res: any, err: any) => void
) => {
  const dsPath: DataSourcePath = JSON.parse(dsPathStr) as DataSourcePath;
  newWindowFromDSPath(dsPath)
    .then(() => cb(null, null))
    .catch((err) => cb(err, null));
};

const appInit = (options: any) => {
  // log.log('appInit: ', options)
  ipcMain.handle("initMain", async (event) => initMainAsync(options));
  ipcMain.handle("errorDialog", (event, title, msg, fatal) =>
    errorDialog(title, msg, fatal)
  );
  ipcMain.handle("newWindowFromDSPath", (event, dsPath) =>
    newWindowFromDSPath(dsPath)
  );
  appMenu.createMenu(); // log.log('appInit: done')
};

const optionDefinitions = [
  {
    name: "srcfile",
    type: String,
    multiple: true,
    defaultOption: true,
    typeLabel:
      "{underline file}.csv or {underline file}.tad or sqlite://{underline file}/{underline table}",
    description:
      "CSV file(.csv with header row), Tad(.tad) file, Parquet file or sqlite file to view",
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
      "$ tad [{italic options}] {underline directory}",
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

const errorDialog = async (
  title: string,
  msg: string,
  fatal = false
): Promise<void> => {
  console.log("*** errorDialog: ", title, msg, fatal);
  dialog.showErrorBox(title, msg);

  if (fatal) {
    app.quit();
  }
};

// construct targetPath based on options:
const getTargetPath = (options: any, filePath: string): string => {
  let targetPath = undefined;
  let srcDir = options["executed-from"];

  if (
    srcDir &&
    filePath &&
    !filePath.startsWith("/") &&
    !filePath.startsWith("sqlite://")
  ) {
    if (srcDir === ".") {
      srcDir = process.cwd();
    }
    // relative path -- prepend executed-from
    targetPath = path.join(srcDir, filePath);
    log.debug("relative path: ", srcDir, filePath, "--->", targetPath);
  } else {
    // absolute pathname or no srcDir:
    targetPath = filePath;
  }

  return targetPath;
};

async function createFileWindows(options: commandLineArgs.CommandLineOptions) {
  for (const srcfile of options.srcfile) {
    const targetPath = getTargetPath(options, srcfile);
    await appWindow.createFromFile(targetPath);
  }
}

(global as any).openExample = () => {
  const app = electron.app;
  const appPath = app.getAppPath();
  const appDir = process.defaultApp ? appPath : path.dirname(appPath);
  const exampleFilePath = path.join(appDir, "examples", "movie_metadata.csv");
  appWindow.createFromFile(exampleFilePath);
};

let openFilePath: string | null = null;

// callback for app.makeSingleInstance:
const initApp =
  (firstInstance: any) =>
  async (instanceArgv: string[], workingDirectory: string | null) => {
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
        console.log("*** defaultApp: injecting --executed-from");
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
      } catch (e) {
        const argErr = e as any;
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
        console.log("*** options.srcfile: ", options.srcfile);
        const noSrcFile =
          options.srcfile == null || options.srcfile.length == 0;
        // Set in "ready" event handler:
        let isReady = false;

        if (firstInstance) {
          const handleOpen = async (
            event: electron.Event,
            filePath: string
          ) => {
            log.log("handleOpen called!");
            log.warn("got open-file event for: ", filePath);
            event.preventDefault();
            const targetPath = getTargetPath(options, filePath);

            if (isReady) {
              log.warn("open-file: app is ready, opening in new window");
              await createFileWindows(options);
            } else {
              openFilePath = targetPath ?? null;
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

            if (!noSrcFile) {
              createFileWindows(options);
            }

            if (showQuickStart) {
              quickStart.showQuickStart();
            }

            if (openFilePath) {
              const openMsg = `pid ${process.pid}: Got open-file for ${openFilePath}`;
              log.warn(openMsg);
              appWindow.createFromFile(openFilePath); // dialog.showMessageBox({ message: openMsg })
            } else {
              if (noSrcFile && !awaitingOpenEvent) {
                app.focus();
                appWindow.openDialog();
              }
            }

            isReady = true;
          });
        } else {
          if (!noSrcFile) {
            createFileWindows(options);
          } else {
            log.warn("initApp called with no targetPath");
            app.focus();
          }
        }
      }
    } catch (e) {
      const err = e as any;
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
