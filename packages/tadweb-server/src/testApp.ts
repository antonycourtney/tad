import * as log from "loglevel";
import { duckDbInstanceCheck } from "reltab-duckdb";

function main() {
  log.setLevel(log.levels.INFO);
  log.getLogger("wtftest");
  log.info("main: set log level to INFO -- ", log.levels.INFO);
  log.info("getLevel returns: ", log.getLevel());
  console.log("all loggers: ", Object.keys(log.getLoggers()));
  duckDbInstanceCheck();
}

main();
