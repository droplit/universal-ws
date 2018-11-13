const path = require('path');
var webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    entry: './dist/library.js',
    output: {
        path: path.resolve(__dirname, 'browser'),
        filename: 'universal-ws.js',
        library: 'universal-ws',
        libraryTarget: 'umd'
    },
    externals: [
        'ws'
    ],
    plugins: [
        new webpack.IgnorePlugin(/ws(?!er)/) // Ignore 'ws' but not `process/browser`
    ]
};