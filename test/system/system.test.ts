/// <reference types="mocha" />
import { expect } from 'chai';
import { UniversalWebSocketServer, Client } from '../../server';
import { UniversalWebSocket } from '../../client';

import * as http from 'http';


describe('WebSockets', function () {
    this.timeout(10000);

    describe('Basic Functions', function () {
        interface BasicContext {
            isAuthenticated: boolean;
            name: string;
        }

        const PORT = 3002;

        let httpServer: http.Server;
        let server: UniversalWebSocketServer<BasicContext>;
        let client: UniversalWebSocket;
        let authenticatedClient: UniversalWebSocket;

        it('Initialize server', function (done) {
            httpServer = http.createServer();
            httpServer.listen(PORT);
            server = new UniversalWebSocketServer(httpServer);

            expect(httpServer, 'HTTP Server exists').to.exist;
            expect(server, 'Universal WebSocket Server exists').to.exist;

            done();
        });

        it('Initialize client and connect to the server', function (done) {
            const name = 'Client 1';
            client = new UniversalWebSocket(`localhost:${PORT}`, undefined, name);

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(client, 'Universal WebSocket Client exists').to.exist;
                expect(sClient, `Universal WebSocket Server's Client instance exists`).to.exist;
                expect(sClient.parameters, 'Universal WebSocket Server Client has name').to.exist;
                if (sClient.parameters && Array.isArray(sClient.parameters)) expect(sClient.parameters[0]).to.equal(name);
                expect(server.listeners('connected').length).to.equal(1);

                done();
            });
        });

        it(`Remove server "connected" handler`, function (done) {
            server.removeListener('connected', server.listeners('connected')[0]);

            expect(server.listeners('connected').length).to.equal(0);

            done();
        });

        it('Initialize authenticated client and connect to the server', function (done) {
            const name = 'Client 2';
            authenticatedClient = new UniversalWebSocket(`localhost:${PORT}`, undefined, 'Client 2', 'supersecurepassword');

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(authenticatedClient, 'Universal WebSocket Client exists').to.exist;
                expect(sClient, `Universal WebSocket Server's Client instance exists`).to.exist;
                // expect(sClient).to.equal()

                done();
            });
        });

        it('Client sends a message which the Server receives', function (done) {
            const message = `Universal WebSocket is pretty great`;
            client.send(message);



            done();
        });

    });

});