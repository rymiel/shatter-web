/* eslint-disable */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const childProcess = require('child_process')
const fs = require('fs');

let versionNumber;
if (fs.existsSync(".version")) {
  versionNumber = fs.readFileSync('.version').toString().trim();
} else {
  versionNumber = childProcess
    .execSync('shards version')
    .toString()
    .trim();
}

const commitHash = childProcess
  .execSync('git rev-parse --short HEAD')
  .toString()
  .trim();

const config = {
  entry: path.join(__dirname, 'src', 'index.tsx'),
  target: 'web',
  module: {
    noParse: /bedrock/,
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      zlib: require.resolve("browserify-zlib"),
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve('buffer/'),
      events: require.resolve('events/'),
      assert: require.resolve('assert/'),
    }
  },
  output: {
    filename: '[name]-[contenthash].bundle.js',
    path: path.resolve(__dirname, 'public'),
  },
  plugins: [
    new HtmlWebpackPlugin({
        template: path.join(__dirname, 'src', 'index.html'),
        filename: path.join(__dirname, 'public', 'index.html')
    }),
    new webpack.EnvironmentPlugin({
      'WS_HOST': null,
      'SHATTER_VERSION': `${versionNumber}-${commitHash}`
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser'
    }),
  ]
};

module.exports = (env, argv) => {
  if (argv.mode === "development") {
    config.devtool = 'inline-source-map';
    config.devServer = {
      static: './public',
      hot: true,
    }
  } else if (argv.mode === "production") {
    config.optimization = {
      splitChunks: {
        chunks: 'all',
      }
    }
  }
  return config;
}
