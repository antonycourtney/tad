var webpack = require("webpack");
var nodeExternals = require("webpack-node-externals");

const config = {
  mode: "development",
  target: "node",
  devtool: "inline-source-map",
  entry: {
    testApp: "./src/testApp.ts",
  },
  output: {
    filename: "[name]-bundle.js",
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [{ test: /\.tsx?$/, loader: "awesome-typescript-loader" }],
  },
  externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
  externals: [
    nodeExternals(),
    nodeExternals({ modulesDir: "../../node_modules" }),
  ],

  optimization: {},
};

module.exports = function (env, argv) {
  return config;
};
