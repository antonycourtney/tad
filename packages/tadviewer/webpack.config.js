// webpack.config.js

var pkg = require("./package.json");
var webpack = require("webpack");
var path = require("path");
var fs = require("fs");
var nodeExternals = require("webpack-node-externals");

process.traceDeprecation = true;

function config(nodeEnv) {
  return {
    entry: {
      tadviewer: "./src/tadviewer.ts",
    },
    devtool: "source-map",
    mode: nodeEnv,
    resolve: {
      extensions: [".webpack.js", ".web.js", ".js", ".ts", ".tsx"],
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      libraryTarget: "commonjs2",
      /* Note!  Do NOT use the library target -- it will cause the top-level exports to be replaced
         with a single "tadviewer" export.
         See: https://github.com/webpack/webpack/issues/11800 for details
      library: {
        name: pkg.name,
        export: "tadviewer",
        type: "commonjs2",
      },
      */
    },
    externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
    externals: [
      nodeExternals(),
      nodeExternals({ modulesDir: "../../node_modules" }),
    ],
    module: {
      rules: [
        // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
        { test: /\.tsx?$/, loader: "awesome-typescript-loader" },

        // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
        {
          enforce: "pre",
          test: /\.js$/,
          loader: "source-map-loader",
          exclude: [/node_modules\/export-to-csv/],
        },
        {
          test: /\.less$/,
          use: ["style-loader", "css-loader", "less-loader"],
        },
        {
          test: /\.scss$/,
          use: [
            "style-loader",
            "css-loader",
            "resolve-url-loader",
            "sass-loader",
          ],
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(jpe?g|png|gif|svg)$/i,
          type: "asset/inline",
        },
        {
          test: /\.(eot|svg|ttf|woff|woff2)$/,
          type: "asset/inline",
        },
      ],
    },
    optimization: {},
    plugins: [
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/stores\/appStore$/ }),
      new webpack.DefinePlugin({
        "process.env": {
          NODE_ENV: JSON.stringify(nodeEnv),
        },
      }),
    ],
  };
}

function development() {
  var dev = config("development");
  Object.assign(dev.optimization, {
    minimize: false,
  });
  return dev;
}

function production() {
  var prod = config("production");
  prod.optimization.minimize = true;
  return prod;
}

const configMap = {
  development: [development()],
  production: [production()],
};

module.exports = function (env, argv) {
  let mode;
  if (!argv || !argv.mode) {
    mode = "development";
  } else {
    mode = argv.mode;
  }
  let conf = configMap[mode];
  return conf;
};
