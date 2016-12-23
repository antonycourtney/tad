// webpack.config.js

var webpack = require('webpack');
var path = require('path');
var fs = require('fs');

function config() {
  return {
    devtool: "source-map",
    resolve: {
        extensions: ["", ".webpack.js", ".web.js", ".js"]
    },
    output: {
        path: "./build/",
        filename: "[name].bundle.js"
    },
    module: {
        loaders: [
          { test: /\.(js|jsx)$/,
            exclude: /node_modules/,
            loader: "babel-loader",
            query: {
              presets:['es2015','react', 'stage-3']
            }
          },
          { test: /\.(json)$/, loader: "json-loader" },
          {
            test: /\.less$/,
            loader: 'style-loader!css-loader!less-loader'
          },
          {
            test: /\.css$/,
            loader: 'style-loader!css-loader'
          },
          {
            test: /\.(jpe?g|png|gif|svg)$/i,
            loaders: [
                'file?hash=sha512&digest=hex&name=[hash].[ext]',
                'image-webpack?bypassOnDebug&optimizationLevel=7&interlaced=false'
            ]
          }
        ]
    }
  }
}

var render = {
  target: "electron",
  entry: {
    renderMain: ['babel-polyfill', './src/renderMain.js']
  }
}

var nodeModules = {};
fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });
nodeModules['timer'] = 'timer'

var app = {
  target: "node",
  entry: {
    main: "./app/main.js",
    csvimport: "./src/csvimport-cli.js",
    allTests: "./test/runAllTests.js"
  },
  externals: nodeModules,
  node: {
    __dirname: false,
    __filename: false
  }
}

function merge (config, env) {
  var merged = Object.assign({}, env, config)
  merged.plugins = (config.plugins || []).concat(env.plugins || [])
  return merged
}
module.exports = [ merge(render, config()), merge(app, config()) ]
