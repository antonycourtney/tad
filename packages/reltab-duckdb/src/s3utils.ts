/**
 * Support routines for using s3 URLs with DuckDb.
 */
import { Connection, DuckDB } from "ac-node-duckdb";
import * as log from "loglevel";

/**
 * Initialize S3 variables on a DuckDb connection from env vars
 * It's a bit unfortunate to do this every time we create a DuckDb
 * connection, but the s3fs extension depends on these vars being
 * set. Hopefully minimal overhead, and we skip if env vars
 * not set.
 */
const AWS_DEFAULT_REGION = "us-west-1";

export async function initS3(dbConn: Connection) {
  const aws_access_key_id = process.env.AWS_ACCESS_KEY_ID;
  if (aws_access_key_id && aws_access_key_id.length > 0) {
    log.debug("AWS_ACCESS_KEY_ID env var found, initializing S3 vars");
    const s3_region = process.env.AWS_REGION ?? AWS_DEFAULT_REGION;
    await dbConn.execute(`SET s3_region='${s3_region}'`);
    await dbConn.execute(`SET s3_access_key_id='${aws_access_key_id}'`);
    await dbConn.execute(
      `SET s3_secret_access_key='${process.env.AWS_SECRET_ACCESS_KEY}'`
    );
    log.debug("initS3: done.");
  }
}
