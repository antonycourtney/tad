export type FileType = "csv" | "parquet" | "tad" | "dspath";

// We could probably use an ADT to make this better
export interface OpenParams {
  fileType: FileType;
  targetPath?: string;
  srcFile?: string;
  fileContents?: string;
  title: string;
}
