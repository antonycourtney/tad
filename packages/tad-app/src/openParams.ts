import { DataSourcePath } from "reltab";

// Version of the .tad files we write. History:
// 1: original format (contents.targetPath)
// 2: contents.dsPath (data source path)
// 3: "auto" number format for real columns
// 4: nested filters
// (For 3 and 4, see tadviewer's VIEW_PARAMS_FORMAT_VERSION, which this must
// be at least; files from earlier versions are migrated when loaded.)
// Versions of Tad before 4 don't check this when loading a file.
export const TAD_FILE_FORMAT_VERSION = 4;

// TODO: various database files / tables
export type OpenType = "fspath" | "tad" | "dspath" | "empty";

// fspath -- a path to a data file (CSV, TSV, parquet, etc) or directory
export interface OpenFSPath {
  openType: "fspath";
  path: string; // filesystem path
}

export interface OpenDSPath {
  openType: "dspath";
  dsPath: DataSourcePath;
}

export interface OpenTad {
  openType: "tad";
  fileContents: string;
  fileBaseName: string; // for title
}

export interface OpenEmpty {
  openType: "empty";
}

export type OpenParams = OpenFSPath | OpenDSPath | OpenTad | OpenEmpty;
