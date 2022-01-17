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
window.openParams = JSON.parse(process.argv[process.argv.length - 1]);
