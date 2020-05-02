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
      library: pkg.name,
      libraryTarget: "commonjs2",
    },
    target: "node",
    externals: [nodeExternals()],
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
          loader: "style-loader!css-loader!less-loader",
        },
        {
          test: /\.scss$/,
          loader: "style-loader!css-loader!resolve-url-loader!sass-loader",
        },
        {
          test: /\.css$/,
          loader: "style-loader!css-loader",
        },
        {
          test: /\.(jpe?g|png|gif|svg)$/i,
          use: [
            {
              loader: "url-loader",
              options: {
                limit: 8000,
                name: "[hash]-[name].[ext]",
              },
            },
            {
              loader:
                "image-webpack-loader?bypassOnDebug&optipng.optimizationLevel=7&gifsicle.interlaced=false",
            },
          ],
        },
        {
          test: /\.(eot|svg|ttf|woff|woff2)$/,
          loader: "file-loader?name=public/fonts/[name].[ext]",
        },
      ],
    },
    optimization: {},
    plugins: [
      new webpack.IgnorePlugin(/^\.\/stores\/appStore$/),
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
  prod.plugins.push(new webpack.optimize.OccurrenceOrderPlugin(true));
  prod.optimization.minimize = {
    compress: {
      warnings: false,
    },
    mangle: {
      except: ["module", "exports", "require"],
    },
  };
  return prod;
}

const configMap = {
  dev: [development()],
  prod: [production()],
};

module.exports = function (env) {
  if (!env) {
    env = "dev";
  }
  return configMap[env];
};
