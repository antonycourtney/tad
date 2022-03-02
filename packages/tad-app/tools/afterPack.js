const path = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const copy = require('recursive-copy');

const WIN_SSL_DIR = '../../../openssl-1.1';

async function afterPack(context) {
  if (context.packager.platform.name === "mac") {
    console.log("On Mac, running dylib-fixup script:");
    const { appOutDir } = context;
    const addonPath = path.join(
      appOutDir,
      "Tad.app/Contents/Resources/app.asar.unpacked/node_modules/ac-node-duckdb/build/Release/node-duckdb-addon.node"
    );
    const { stdout, stderr } = await exec(
      `./tools/dylib-fixup.sh ${addonPath}`
    );
    console.log(stdout);
    console.error(stderr);
  }
  if (context.packager.platform.name === "windows") {
    const { appOutDir } = context;
    const duckDbTargetDir = path.join(appOutDir, 'resources/app.asar.unpacked/node_modules/ac-node-duckdb/build/Release');
    const sslBinDir = path.join(WIN_SSL_DIR, 'x64/bin');
    const results = await copy(sslBinDir, duckDbTargetDir);
    console.info('afterPack: Copied ' + results.length + ' files from SSL bin dir to target');
  }
}

exports.default = afterPack;
