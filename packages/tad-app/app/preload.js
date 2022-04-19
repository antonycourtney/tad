/* preload script for renderer process */
// const { contextBridge } = require("electron");
/*
contextBridge.exposeInMainWorld(
  "openParams",
  JSON.parse(process.argv[process.argv.length - 1])
);
*/
// Note: The openParams were appended to process.argv via
// the webPreferences.additionalArguments passed to BrowserWindow
// constructor.
const argPrefix = '--tadOpenParams=';
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith(argPrefix)) {
    const openParamsStr = arg.slice(argPrefix.length);
    window.openParams = JSON.parse(openParamsStr);
  }
}
