// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

//@ts-check

const path = require('node:path');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules|webview/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
      {
        test: /\.ts$/,
        include: /node_modules[\\/]@f5xc-salesdemos/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              allowTsInNodeModules: true,
              transpileOnly: true,
              configFile: path.resolve(__dirname, 'tsconfig.vendor.json'),
            },
          },
        ],
      },
    ],
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: 'log',
  },
};

module.exports = [extensionConfig];
