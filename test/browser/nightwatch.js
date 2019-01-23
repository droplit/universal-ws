// Start static server
const express = require('express')
const app = express()
const port = 3000
const path = require('path');
app.use('/', express.static(__dirname + '/'));
app.use('/node_modules', express.static(path.resolve(__dirname + '../../../node_modules')));
const server = app.listen(port, () => console.log(`Running test server on port ${port}!`))


const chalk = require('chalk');
const { spawn } = require('child_process');
const child = spawn('mocha', [path.resolve(__dirname, './server.js')], { 'stdio': 'pipe', shell: true  });

child.stdout.on('data', (data) => {
    console.log(chalk.yellow(data));
});

child.stderr.on('data', (data) => {
    console.log(chalk.red(data));
});

child.on('close', (code) => {
    console.log(chalk.blue(`child process exited with code ${code}`));
});

// Execute browser
const { expect } = require('chai');
describe('Mocha with Nightwatch', function () {
    this.slow(100000);
    after(function (browser, done) {

        browser.end(function () {
            server.close();
            done();
        });
    });

    it('In browser tests', function (browser) {
        browser
            .url(`localhost:${port}/index.html`)

        browser.executeAsync(function (done) {
            mocha.run(function (failures) {
                done(failures);
            });
        }, [], (results) => {
            if (results.value > 0) {
                browser.waitForElementVisible('#holdBrowserOpenPlease', 1000000);
            }
        });

    });
});
