const path = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

async function afterPack(context) {
  if (context.packager.platform.name === "mac") {
    console.log("On Mac, running dylib-fixup script:");
    const { appOutDir } = context;
    const addonPath = path.join(
      appOutDir,
      "Tad.app/Contents/Resources/app.asar.unpacked/node_modules/node-duckdb/build/Release/node-duckdb-addon.node"
    );
    const { stdout, stderr } = await exec(
      `./tools/dylib-fixup.sh ${addonPath}`
    );
    console.log(stdout);
    console.error(stderr);
  }
}

exports.default = afterPack;
