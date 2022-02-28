import { Connection } from "ac-node-duckdb";

export const dbAll = async (
  dbConn: Connection,
  query: string
): Promise<any> => {
  const resIter = await dbConn.executeIterator(query);
  const resRows = resIter.fetchAllRows();
  resIter.close();
  return resRows;
};
