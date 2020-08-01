const path = require('path');
const webpack = require('webpack');

const PnpWebpackPlugin = require(`pnp-webpack-plugin`);

module.exports = {
    entry: './dist/library.js',
    output: {
        path: path.resolve(__dirname, 'browser'),
        filename: 'universal-ws.js',
        library: 'universalWebSocket',
        libraryTarget: 'umd'
    },
    externals: [
        'ws'
    ],
    plugins: [
        new webpack.IgnorePlugin(/^ws$/) // Ignore 'ws' but not `process/browser`
    ],
    resolve: {
        plugins: [
            PnpWebpackPlugin,
        ],
    },
    resolveLoader: {
        plugins: [
            PnpWebpackPlugin.moduleLoader(module),
        ],
    },
};