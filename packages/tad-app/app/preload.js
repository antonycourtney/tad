/* preload script for renderer process */
// const { contextBridge } = require("electron");
/*
contextBridge.exposeInMainWorld(
  "openParams",
  JSON.parse(process.argv[process.argv.length - 1])
);
*/
window.openParams = JSON.parse(process.argv[process.argv.length - 1]);
