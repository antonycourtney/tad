// webpack.config.js

var webpack = require('webpack');


module.exports = {
    entry: {
      eprender: "./src/eprender.js"
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
};
