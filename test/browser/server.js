/// <reference types="mocha" />

const { expect } = require('chai');
const { createServer, Server } = require('http');
// import * as express from 'express';
const { UniversalWebSocketServer, Client, } = require('../../server/dist/library');

const PORT = 3005;
const AUTHENTICATED_PORT = 3006;

describe('Universal WS Server', function () {
    this.timeout(15 * 1000);

    let httpServer;
    let uws;
    const clients = [];
    let authenticatedHttpServer;
    let authenticatedUws;
    const authenticatedClients = [];

    beforeEach(function (done) {
        setTimeout(done, 500)
    });

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
        uws.on('connected', (client) => {
            expect(client).to.exist;
            clients.push(client);
            httpServer.close();
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
        authenticatedUws.on('connected', (client) => {
            expect(client).to.exist;
            const [username, password] = client.parameters || [undefined, undefined];
            console.log(`Client ${username} connected. Their password is ${password}`);
            expect(client.parameters).to.exist;
            expect(client.parameters.length).to.equal(2);
            expect(username).to.exist;
            expect(username).to.equal('Boats');
            expect(password).to.exist;
            expect(password).to.equal('USS-History-Supreme');
            authenticatedClients.push(client);
            done();
        });
    });

});