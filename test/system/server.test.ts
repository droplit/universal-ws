/// <reference types="mocha" />

import { expect } from 'chai';
import { createServer, Server } from 'http';
// import * as express from 'express';
import { UniversalWebSocketServer, Client, } from '../../server/dist/library';

const PORT = 3005;
const AUTHENTICATED_PORT = 3006;

describe('Universal WS Server', function () {
    this.timeout(10 * 1000);

    let httpServer: Server;
    let uws: UniversalWebSocketServer;
    const clients: Client[] = [];
    let authenticatedHttpServer: Server;
    let authenticatedUws: UniversalWebSocketServer;
    const authenticatedClients: Client[] = [];

    it(`Initialize the server with port ${PORT}`, function (done) {
        httpServer = createServer();
        expect(httpServer).to.exist;
        httpServer.listen(PORT, () => {
            console.log('Server listening to port:', PORT);
        });
        uws = new UniversalWebSocketServer(httpServer);
        expect(uws).to.exist;

        done();
    });

    it(`Handle a new client connecting`, function (done) {
        uws.on('connected', (client: Client) => {
            expect(client).to.exist;
            clients.push(client);
            done();
        });
    });

    it(`Initialize the authenticated server with port ${AUTHENTICATED_PORT}`, function (done) {
        authenticatedHttpServer = createServer();
        expect(authenticatedHttpServer).to.exist;
        authenticatedHttpServer.listen(AUTHENTICATED_PORT, () => {
            console.log('Authenticated Server listening to port:', AUTHENTICATED_PORT);
        });
        authenticatedUws = new UniversalWebSocketServer(authenticatedHttpServer);
        expect(authenticatedUws).to.exist;

        done();
    });

    it(`Handle a new authenticated client connecting`, function (done) {
        authenticatedUws.on('connected', (client: Client) => {
            expect(client).to.exist;
            console.log(`Client connected. Their token is ${client.token}`);
            expect(client.token).to.equal('USS-History-Supreme');

            authenticatedClients.push(client);
            done();
        });
    });

});