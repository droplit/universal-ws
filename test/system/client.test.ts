/// <reference types="mocha" />
import { expect } from 'chai';
import { UniversalWebSocket } from '../../client/dist/library';

const PORT = 3005;
const AUTHENTICATED_PORT = 3006;

const clients: UniversalWebSocket[] = [];

describe('WebSockets', function () {
    this.timeout(10000);

    it(`Initialize a client by connecting to port ${PORT}`, function (done) {
        const client = new UniversalWebSocket(`ws://localhost:${PORT}`);
        expect(client).to.exist;
        clients.push(client);
        done();
    });

    it(`Initialize an authenticated client by connecting to port ${AUTHENTICATED_PORT}`, function (done) {
        const client = new UniversalWebSocket(`ws://localhost:${AUTHENTICATED_PORT}`, { token: 'USS-History-Supreme' });
        expect(client).to.exist;
        clients.push(client);
        done();
    });
});