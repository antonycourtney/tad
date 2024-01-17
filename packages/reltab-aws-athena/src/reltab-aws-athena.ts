import * as log from "loglevel";
import {
  TableRep,
  QueryExp,
  Schema,
  DataSourceConnection,
  defaultEvalQueryOptions,
  EvalQueryOptions,
  DataSourceProvider,
  registerProvider,
  DbDriver,
  SQLDialect,
  DbDataSource,
  ColumnStatsMap,
} from "reltab";
import {
  LeafSchemaMap,
  Row,
  ColumnMetaMap,
  DataSourceId,
  PrestoDialect,
  DataSourceNode,
  DataSourcePath,
} from "reltab";
import * as aws from "aws-sdk";
import * as path from "path";

const AthenaExpress = require("athena-express");

const REGION = "us-west-2";

aws.config.update({ region: REGION });
const athenaExpressConfig = { aws }; //configuring athena-express with aws sdk object
const athenaExpress = new AthenaExpress(athenaExpressConfig);

const mapIdent = (src: string): string => {
  const ret = src.replace(/[^a-z0-9_]/gi, "_");
  return ret;
};

const isAlpha = (ch: string): boolean => /^[A-Z]$/i.test(ch);

export class AWSAthenaDriver implements DbDriver {
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect = PrestoDialect;
  tableMap: LeafSchemaMap;

  constructor() {
    this.sourceId = {
      providerName: "aws-athena",
      resourceId: "",
    };
    this.tableMap = {};
  }

  async getDisplayName(): Promise<string> {
    return "AWS Athena";
  }

  async runSqlQuery(sqlQuery: string): Promise<Row[]> {
    const qres = await athenaExpress.query(sqlQuery);
    const rows = qres.Items as Row[];
    return rows;
  }

  async importCsv(): Promise<void> {
    throw new Error("importCsv not implemented for aws-athena");
  }

  async getTableSchema(tableName: string): Promise<Schema> {
    const sqlQuery = `DESCRIBE ${tableName}`;

    const qres = await athenaExpress.query(sqlQuery);
    const items = qres.Items; // each item has one key (column name), mapped to its type.

    const extendCMap = (cmm: ColumnMetaMap, item: any): ColumnMetaMap => {
      const cnm = Object.keys(item)[0] as string;
      const cType = (item[cnm] as string).toLocaleUpperCase();

      const cmd = {
        displayName: cnm,
        columnType: cType,
      };
      cmm[cnm] = cmd;
      return cmm;
    };

    const columnIds = items.map((item: any) => Object.keys(item)[0]);
    const cmMap = items.reduce(extendCMap, {});
    const schema = new Schema(PrestoDialect, columnIds, cmMap);
    return schema;
  }

  async getSqlQuerySchema(sqlQuery: string): Promise<Schema> {
    throw new Error(
      "AWSAthenaDriver.getSqlQuerySchema: base sql queries not supported"
    );
  }

  async getSqlQueryColumnStatsMap(sqlQuery: string): Promise<ColumnStatsMap> {
    return {};
  }

  async getRootNode(): Promise<DataSourceNode> {
    throw new Error("getRootNode not yet implemented for aws-athena");
  }

  async getChildren(dsPath: DataSourcePath): Promise<DataSourceNode[]> {
    // TODO
    return [];
  }
  async getTableName(dsPath: DataSourcePath): Promise<string> {
    const { path } = dsPath;
    if (path.length < 1) {
      throw new Error("getTableName: empty path");
    }
    return path[path.length - 1];
  }
}

const awsAthenaDataSourceProvider: DataSourceProvider = {
  providerName: "aws-athena",
  connect: async (resourceId: any): Promise<DataSourceConnection> => {
    const driver = new AWSAthenaDriver();
    const dsConn = new DbDataSource(driver);
    return dsConn;
  },
};

registerProvider(awsAthenaDataSourceProvider);
