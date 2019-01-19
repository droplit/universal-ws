const { UniversalWebSocket } = require('../../client');
const { expect } = require('chai');

const PORT = 3005;
const AUTHENTICATED_PORT = 3006;

const clients = [];

describe('Universal WS', function () {
    this.timeout(15000);

    beforeEach(function (done) {
        setTimeout(function () {
            done();
        }, 2000);
    });

    it('UWS Exists', function (done) {
        console.log(UniversalWebSocket);
        expect(UniversalWebSocket).to.exist;
        setTimeout(function () {
            done();
        }, 1000);
    });


    it(`Initialize a client by connecting to port ${PORT}`, function (done) {
        const host = `ws://localhost:${PORT}`;
        console.log('Connecting to host:', host);
        const client = new UniversalWebSocket(host);
        expect(client).to.exist;
        client.on('connected', () => {
            done();
            client.close();
        })
    });

    it(`Initialize an authenticated client by connecting to port ${AUTHENTICATED_PORT}`, function (done) {
        const client = new UniversalWebSocket(`ws://localhost:${AUTHENTICATED_PORT}`, { token: 'USS-History-Supreme' });
        expect(client).to.exist;
        client.on('connected', () => {
            done();
            client.close();
        })
    });
    it('fail', function (done) {
        expect(null).to.exist;
        done("blah");
    });
});
