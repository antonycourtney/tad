// webpack.config.js

var webpack = require('webpack');
var path = require('path');
var fs = require('fs');
var env = process.env.NODE_ENV === 'production' ? 'production'
  : (process.env.NODE_ENV === 'test' ? 'test' : 'development');

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
                'image-webpack?bypassOnDebug&optipng.optimizationLevel=7&gifsicle.interlaced=false'
            ]
          }
        ]
    },
    plugins: [
      new webpack.IgnorePlugin(/^\.\/stores\/appStore$/),
      new webpack.DefinePlugin({
        'process.env': {
          NODE_ENV: JSON.stringify(env)
        }
      })
    ]
  }
}

function development() {
  var dev = config()
  return dev;
}

function production () {
  var prod = config()
  prod.plugins.push(new webpack.optimize.DedupePlugin())
  prod.plugins.push(new webpack.optimize.OccurrenceOrderPlugin(true))
  prod.plugins.push(new webpack.optimize.UglifyJsPlugin({
    compress: {
      warnings: false
    },
    mangle: {
      except: ['module', 'exports', 'require']
    }
  }))
  return prod
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

module.exports = {
  development: [
    merge(render, development()),
    merge(app, development())
  ],
  production: [
    merge(render, production()),
    merge(app, production())
  ]
}[env]
