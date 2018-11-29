const path = require('path');
var webpack = require('webpack');

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
        new webpack.IgnorePlugin(/^ws$/) // Ignore 'ws' but not `process/browser`
    ]
};