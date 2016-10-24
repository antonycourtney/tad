// webpack.config.js

var webpack = require('webpack');


module.exports = {
    entry: {
      epmain: "./src/epmain.js"
    },
    output: {
        path: "./build/",
        filename: "[name].bundle.js"
    },
    // Enable sourcemaps for debugging webpack's output.
    devtool: "source-map",
    resolve: {
        extensions: ["", ".webpack.js", ".web.js", ".js"]
    },
    module: {
        loaders: [
          { test: /\.(js|jsx)$/,
            exclude: /node_modules/,
            loader: "babel-loader",
            query: {
              presets:['es2015','react']
            }
          },
          { test: /\.(json)$/, loader: "json-loader" }
        ]
    }
};
