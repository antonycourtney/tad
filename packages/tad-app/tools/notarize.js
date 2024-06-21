const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appleId = process.env.APPLEID;
  if (!appleId) {
    console.error(
      "notarize.js: APPLEID env var not set. Please set APPLEID and APPLEIDPASS env vars to your Apple ID and password"
    );
    throw new Error("notarize: Apple ID credentials not set");
  }

  return await notarize({
    appBundleId: "com.antonycourtney.tad",
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword: process.env.APPLEIDPASS,
    teamId: "VPS8BQAV8D",
  });
};
