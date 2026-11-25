/*
 * Test data for the UI tests: a deterministic orders table, written as
 * Parquet, plus .tad workspace files that open it sorted and pivoted.
 */
import { DuckDBInstance } from "@duckdb/node-api";
import * as fs from "fs";
import * as path from "path";

export const N_ROWS = 100_000;
export const REGIONS = ["North", "South", "East", "West", "Central"];
export const COUNTRIES_PER_REGION = 20;
export const ROWS_PER_COUNTRY = N_ROWS / (REGIONS.length * COUNTRIES_PER_REGION);
export const COLUMNS = [
  "order_id",
  "region",
  "country",
  "product",
  "quantity",
  "unit_price",
  "revenue",
  "order_url",
  "note",
];

export const PARQUET_FILE = "orders.parquet";
// Tad adds a record count column when opening a table:
export const REC_COLUMN = "Rec";
// Flat view, sorted by order_id:
export const SORTED_TAD_FILE = "orders-sorted.tad";
// Pivoted by region > country (leaf column: product), sorted by order_id:
export const PIVOT_TAD_FILE = "orders-pivot.tad";
export const PIVOT_DISPLAY_COLUMNS = ["order_id", "quantity", "revenue", "note"];

/** Path of a generated test file (global-setup sets TAD_E2E_DATA_DIR). */
export const testFile = (name: string): string => {
  const dir = process.env.TAD_E2E_DATA_DIR;
  if (!dir) {
    throw new Error("TAD_E2E_DATA_DIR not set; is global-setup configured?");
  }
  return path.join(dir, name);
};

const sqlString = (s: string) => "'" + s.replace(/'/g, "''") + "'";

// Order i is in region i % 5 and country (i / 5) % 20, so each
// (region, country) group has ROWS_PER_COUNTRY orders, and ordering
// groups by sum(order_id) gives REGIONS order and "Country 00", "01", ...
const ordersQuery = `
  SELECT
    i AS order_id,
    ['North', 'South', 'East', 'West', 'Central'][1 + (i % 5)] AS region,
    'Country ' || lpad(((i // 5) % ${COUNTRIES_PER_REGION})::VARCHAR, 2, '0') AS country,
    'Product ' || lpad(((i * 7919) % 50)::VARCHAR, 2, '0') AS product,
    (1 + ((i * 31) % 20))::INTEGER AS quantity,
    round(5 + ((i * 2654435761) % 100000) / 100.0, 2) AS unit_price,
    round((1 + ((i * 31) % 20)) * (5 + ((i * 2654435761) % 100000) / 100.0), 2) AS revenue,
    CASE WHEN i % 4 = 0 THEN 'https://example.com/orders/' || i ELSE NULL END AS order_url,
    'Order note ' || i AS note
  FROM range(${N_ROWS}) t(i)
  ORDER BY i
`;

// Tad's default number / text formats (see tadviewer ViewParams.ts):
const defaultFormats = {
  string: {},
  integer: { decimalPlaces: 0, formatMethod: "toLocaleString" },
  real: {},
  boolean: { decimalPlaces: 0 },
};

const tadFile = (parquetPath: string, viewParams: object): string =>
  JSON.stringify(
    {
      tadFileFormatVersion: 2,
      contents: {
        dsPath: {
          sourceId: { providerName: "localfs", resourceId: parquetPath },
          path: ["."],
        },
        viewParams: {
          showRoot: false,
          displayColumns: COLUMNS,
          vpivots: [],
          sortKey: [],
          openPaths: { _rep: {} },
          aggMap: {},
          columnFormats: {},
          defaultFormats,
          ...viewParams,
        },
      },
    },
    null,
    2
  );

export async function generateTestData(dir: string): Promise<void> {
  const parquetPath = path.join(dir, PARQUET_FILE);
  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  try {
    await conn.run(
      `COPY (${ordersQuery}) TO ${sqlString(parquetPath)} (FORMAT parquet)`
    );
  } finally {
    conn.closeSync();
  }

  fs.writeFileSync(
    path.join(dir, SORTED_TAD_FILE),
    tadFile(parquetPath, { sortKey: [["order_id", true]] })
  );
  fs.writeFileSync(
    path.join(dir, PIVOT_TAD_FILE),
    tadFile(parquetPath, {
      showRoot: true,
      vpivots: ["region", "country"],
      pivotLeafColumn: "product",
      displayColumns: PIVOT_DISPLAY_COLUMNS,
      sortKey: [["order_id", true]],
    })
  );
}
