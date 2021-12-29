import { DataSourcePath } from "reltab";

// TODO: various database files / tables
export type OpenType = "csv" | "parquet" | "tad" | "dspath";

// For csv or parquet files
export interface OpenDataFile {
  openType: "csv" | "parquet";
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

export type OpenParams = OpenDataFile | OpenDSPath | OpenTad;
