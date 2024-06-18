import * as reltab from "reltab";
import * as csv from "fast-csv";
import * as fs from "fs";
import { BrowserWindow, dialog } from "electron";
import { DbDataSource } from "reltab";
import { ExportFormat, ParquetExportOptions } from "tadviewer";
import path from "path";

export const openExportBeginDialog = async (
  win: BrowserWindow,
  filterRowCount: number,
  query: reltab.QueryExp
) => {
  win.webContents.send("open-export-begin-dialog", {
    openState: true,
    filterRowCount,
  });
};

export const exportFile = async (
  win: BrowserWindow,
  exportFormat: ExportFormat,
  exportPath: string,
  filterRowCount: number,
  query: reltab.QueryExp,
  parquetExportOptions: ParquetExportOptions
) => {
  if (exportFormat === "csv") {
    return exportCSV(win, exportPath, filterRowCount, query);
  } else if (exportFormat === "parquet") {
    return exportParquet(win, exportPath, query, parquetExportOptions);
  } else {
    console.error("Unsupported export format: ", exportFormat);
  }
};

const exportParquet = async (
  win: BrowserWindow,
  saveFilename: string,
  query: reltab.QueryExp,
  parquetExportOptions: ParquetExportOptions
) => {
  let exportPercent = 0;
  const exportPathBaseName = path.basename(saveFilename);
  win.webContents.send("open-export-progress-dialog", {
    openState: true,
    exportPathBaseName,
    exportPercent,
  });

  try {
    const appRtc = reltab.getExportConnection() as DbDataSource;

    const baseQuery = await appRtc.getSqlForQuery(query);

    const copyQuery = `COPY (${baseQuery}) TO '${saveFilename}' (FORMAT 'parquet', COMPRESSION '${parquetExportOptions.compression}')`;

    const rows = await appRtc.db.runSqlQuery(copyQuery);
  } catch (rawErr) {
    const err = rawErr as Error;
    win.webContents.send("close-export-progress-dialog");

    dialog.showErrorBox("Error saving file: ", err.toString());
  }
  win.webContents.send("export-progress", {
    percentComplete: 1,
  });
};

// maximum number of items outstanding before pause and commit:
// Some studies of sqlite found this number about optimal
const BATCHSIZE = 10000;
const exportCSV = async (
  win: BrowserWindow,
  saveFilename: string,
  filterRowCount: number,
  query: reltab.QueryExp
) => {
  let exportPercent = 0;
  const exportPathBaseName = path.basename(saveFilename);

  win.webContents.send("open-export-progress-dialog", {
    openState: true,
    exportPathBaseName,
    exportPercent,
  });
  const csvStream = csv.format({
    headers: true,
  });
  const writableStream = fs.createWriteStream(saveFilename);
  csvStream.pipe(writableStream);
  const appRtc = reltab.getExportConnection() as DbDataSource;
  if (appRtc == null) {
    console.error("exportCSV: no DataSource available for export");
    return;
  }

  const schema = await appRtc.getSchema(query); // Map entries in a row object to array of [displayName, value] pairs

  const mapRow = (row: reltab.Row) => {
    return schema.columns.map((cid) => [schema.displayName(cid), row[cid]]);
  };

  let offset = 0;
  let percentComplete = 0;

  while (offset < filterRowCount) {
    let limit = Math.min(BATCHSIZE, filterRowCount - offset);
    let res = await appRtc.evalQuery(query, offset, limit);
    res.rowData.map((row) => {
      csvStream.write(mapRow(row));
    });
    offset += res.rowData.length;
    percentComplete = offset / filterRowCount;
    win.webContents.send("export-progress", {
      percentComplete,
    });
  }

  csvStream.end();
  win.webContents.send("export-progress", {
    percentComplete: 1,
  });
};
