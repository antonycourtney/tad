// webpack.config.js

var webpack = require("webpack");
var path = require("path");
var fs = require("fs");

process.traceDeprecation = true;

function config(nodeEnv) {
  return {
    devtool: "source-map",
    mode: nodeEnv,
    resolve: {
      extensions: [".webpack.js", ".web.js", ".js", ".ts", ".tsx"],
    },
    output: {
      path: __dirname + "/dist/",
      filename: "[name].bundle.js",
    },
    module: {
      rules: [
        // All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
        { test: /\.tsx?$/, loader: "awesome-typescript-loader" },

        // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
        {
          enforce: "pre",
          test: /\.js$/,
          loader: "source-map-loader",
          exclude: [/node_modules\/export-to-csv/, /fast-csv/],
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
          use: [
            {
              loader: "file-loader",
              options: {
                hash: "sha512",
                digest: "hex",
                name: "[hash].[ext]",
              },
            },
            {
              loader: "image-webpack-loader",
              options: {
                bypassOnDebug: true,
                optipng: {
                  optimizationLevel: 7,
                },
                gifsicle: {
                  interlaced: false,
                },
              },
            },
          ],
        },
        {
          test: /\.(eot|svg|ttf|woff|woff2)$/,
          use: {
            loader: "file-loader",
            options: {
              name: "public/fonts/[name].[ext]",
            },
          },
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
  prod.optimization.minimize = true;
  return prod;
}

var render = {
  target: "electron-renderer",
  entry: {
    tadapp: "./src/electronRenderMain.tsx",
  },
};

var nodeModules = {};
fs.readdirSync("node_modules")
  .filter(function (x) {
    return [".bin"].indexOf(x) === -1;
  })
  .forEach(function (mod) {
    nodeModules[mod] = "commonjs " + mod;
  });
nodeModules["timer"] = "timer";

var app = {
  target: "electron-main",
  entry: {
    main: "./app/main.ts",
  },
  externals: nodeModules,
  node: {
    __dirname: false,
    __filename: false,
  },
};

function merge(config, env) {
  var merged = Object.assign({}, env, config);
  merged.plugins = (config.plugins || []).concat(env.plugins || []);
  return merged;
}

const configMap = {
  development: [merge(app, development()), merge(render, development())],
  production: [merge(app, production()), merge(render, production())],
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
