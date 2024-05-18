const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  entry: {
    sa_primary_oauth_bundle: "./server.js"
  },
  output: {
    path: path.resolve(__dirname, "./build"),
    filename: "[name].js"
  },
  optimization: {
    splitChunks: false
  },
  ignoreWarnings: [{ message: /entrypoint size limit/ }, { message: /webpack performance recommendations/ }, { message: /asset size limit/ }],
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: ["lit-scss-loader", "extract-loader", "css-loader", "sass-loader"]
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: "url-loader",
            options: {
              limit: 8192,
              name: "[name].[ext]",
              esModule: false
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/index.html"
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: "./favicon.ico", to: "./favicon.ico" }]
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, "./server")
    },
    client: {
      overlay: {
        errors: false,
        warnings: false,
        runtimeErrors: false
      }
    },
    port: 3000,
    open: true
  }
};
