/// <reference types="mocha" />
import { expect } from 'chai';
import { Access as Wss, WsContext } from '../server';
import { Access as Ws } from '../client/';
import * as http from 'http';

const PORT = 3002;

let httpServer: http.Server;
let server: Wss;
const clientContexts: WsContext[] = [];
const clients: Ws[] = [];

function initializeServer(done: () => void) {
    httpServer = http.createServer();
    httpServer.on('error', (error) => console.log('Server error:', error));
    httpServer.on('listening', () => {
        console.log('Server listening');
        done();
    });

    httpServer.on('close', () => {
        console.log('Server closed.');
        process.exit(0);
    });
    server = new Wss(httpServer);
    httpServer.listen(PORT);
    server.on('connected', (connection: WsContext) => {
        clientContexts.push(connection);
    });
}

function initializeClient(callback: () => void) {
    clients.push(new Ws(`ws://localhost:${PORT}`, undefined, callback));
}

describe('WebSockets', function () {
    this.timeout(10000);

    before((done) => {
        initializeServer(() => {
            console.log('**server ready**');
            initializeClient(() => {
                console.log('**client ready**');
                done();
            });
        });

    });

    it('Send a message "test"', (done) => {
        expect(clientContexts[0], 'Server has a client connection').to.exist;
        server.sendMessage(clientContexts[0], 'test');
        clients[0].onMessage('test', (data: any) => {
            console.log('Client received "test"');
            console.log('data:', data);
            done();
        });
    });

    it('Send 1000 "test" messages in 1 second', (done) => {
        const tests: string[] = [];
        let iterator = 0;
        clients[0].onMessage(`iterationTest`, (iteration: number) => {
            if (iteration >= 1000) {
                check();
            } else {
                tests[+iteration] = '';
            }
        });
        const interval = setInterval(() => {
            server.sendMessage(clientContexts[0], `iterationTest`, iterator++);
        }, 1);

        function check() {
            clearInterval(interval);
            expect(tests.length, 'Received all 1000 messages').to.equal(1000);
            done();
        }
    });

    it('Send 1000 junk(1000) messages in 1 second', (done) => {
        const tests: string[] = [];
        let iterator = 0;
        clients[0].onMessage(`iterationTest`, (junkTest: { iterator: number, junk: string }) => {
            if (junkTest.iterator >= 1000) {
                check();
            } else {
                tests[+junkTest.iterator] = '';
            }
        });
        const interval = setInterval(() => {
            server.sendMessage(clientContexts[0], `iterationTest`, {
                iterator: iterator++,
                junk: Array(1000).fill('junk').join(', ')
            });
        }, 1);

        function check() {
            clearInterval(interval);
            expect(tests.length, 'Received all 1000 messages').to.equal(1000);
            done();
        }
    });

    after((done) => {
        clients.forEach(client => {
            client.close();
        });
        httpServer.close();
        done();
    });
});