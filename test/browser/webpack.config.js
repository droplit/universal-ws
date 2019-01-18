const path = require('path');
var webpack = require('webpack');

module.exports = {
    entry: './uws.spec.js',
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: 'bundle.js',
    },
    devtool: 'inline-source-map'
};