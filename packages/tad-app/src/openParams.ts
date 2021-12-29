import { DataSourcePath } from "reltab";

// TODO: various database files / tables
export type OpenType = "fspath" | "tad" | "dspath";

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

export type OpenParams = OpenFSPath | OpenDSPath | OpenTad;
