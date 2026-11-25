/**
 * electron-builder afterPack hook.
 *
 * Previously used to bundle OpenSSL dylibs alongside the duckdb native
 * addon; no longer needed since @duckdb/node-api ships self-contained
 * prebuilt binaries. Kept as a hook point for future packaging steps.
 */
async function afterPack(context) {
  console.log("afterPack hook called:", context.packager.platform.name);
}

exports.default = afterPack;
