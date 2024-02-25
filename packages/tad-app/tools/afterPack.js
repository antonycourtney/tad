const path = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const copy = require("recursive-copy");

//const WIN_SSL_DIR = '../../../openssl-1.1';

async function afterPack(context) {
  console.log("afterPack hook called:", context.packager.platform.name);
  console.log('skipping OpenSSL bundling (no longer required by duckdb)');
  /*
  if (context.packager.platform.name === "mac") {
    console.log("On Mac, running dylib-fixup script:");
    const { appOutDir } = context;
    const addonPath = path.join(
      appOutDir,
      "Tad.app/Contents/Resources/app.asar.unpacked/node_modules/duckdb/lib/binding/duckdb.node"
    );
    const { stdout, stderr } = await exec(
      `./tools/dylib-fixup.sh ${addonPath}`
    );
    console.log(stdout);
    console.error(stderr);
  }
  if (context.packager.platform.name === "windows") {
    const WIN_SSL_DIR = process.env.OPENSSL_ROOT_DIR;
    console.log("On Windows, packaging OPENSSL dlls from ", WIN_SSL_DIR);
    const { appOutDir } = context;
    const duckDbTargetDir = path.join(
      appOutDir,
      "resources/app.asar.unpacked/node_modules/duckdb/lib/binding"
    );
    const sslBinDir = path.join(WIN_SSL_DIR, "bin");
    const results = await copy(sslBinDir, duckDbTargetDir);
    console.info(
      "afterPack: Copied " +
        results.length +
        " files from SSL bin dir to target"
    );
  }
  */
}

exports.default = afterPack;
