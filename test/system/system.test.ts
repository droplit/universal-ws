/// <reference types="mocha" />
import { expect } from 'chai';
import * as getPort from 'get-port';
// @ts-ignore
import * as HttpShutdown from 'http-shutdown';
import { UniversalWebSocketServer, Client, StatusCode } from '../../server';
import { UniversalWebSocket } from '../../client';

import * as http from 'http';

describe('WebSockets', function () {
    this.timeout(10000);

    describe('Basic Functions', function () {
        interface BasicContext {
            isAuthenticated: boolean;
            name: string;
        }

        let PORT: number;
        let HOST = '';

        let httpServer: http.Server;
        const uws: {
            server: UniversalWebSocketServer<BasicContext>,
            client: UniversalWebSocket
        } = {} as any;
        // let authenticatedClient: UniversalWebSocket;

        before(function (done) {
            getPort().then((port) => {
                PORT = port;
                HOST = `ws://localhost:${port}`;
                done();
            });
        });

        after(function (done) {
            uws.client.close();
            (<any>httpServer).shutdown();
            done();
        });

        it('Initialize server', function (done) {
            httpServer = HttpShutdown(http.createServer());
            httpServer.listen(PORT);
            uws.server = new UniversalWebSocketServer(httpServer);

            expect(httpServer, 'HTTP Server exists').to.exist;
            expect(uws.server, 'UWS Server exists').to.exist;

            done();
        });

        it('Initialize client', function (done) {
            uws.client = new UniversalWebSocket(HOST);
            expect(uws.client, 'UWS Client exists').to.exist;
            delete uws.client;
            done();
        });

        it('Client connects to the server', function (done) {
            const name = 'Client 1';
            uws.client = new UniversalWebSocket(HOST, undefined, name);
            uws.server.on('connected', (client: Client<BasicContext>) => {
                expect(client.parameters).to.exist;
                expect(client.parameters).to.be.an('array');
                const [_name] = client.parameters!;
                expect(_name, `UWS Server's client's name is ${name}`).to.equal(name);
                expect(uws.server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                // Clean up
                client.close(StatusCode.Going_Away);
                uws.server.removeAllListeners('connected');
                expect(uws.server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);
                delete uws.client;
                done();
            });
        });

        // it('Fail client authentication', function (done) {
        //     const name = 'Client 2';
        //     const password = 'supersecurepassword';
        //     uws.client = new UniversalWebSocket(HOST, undefined, name, 'potato');
        //     uws.server.on('connected', (client: Client<BasicContext>) => {
        //         expect(client.parameters).to.exist;
        //         expect(client.parameters).to.be.an('array');
        //         expect(client.parameters![0], `UWS Server's client's name is ${name}`).to.equal(name);
        //         expect(client.parameters![1], `UWS Server's client's password is ${password}`).to.not.equal(password);
        //         client.close(StatusCode.Invalid_Data);
        //         // Clean up listeners
        //         uws.server.removeAllListeners('connected');
        //         delete uws.client;
        //         done();
        //     });

        // });

        // it('Fail client connection with custom status code', function (done) {
        //     const FailedToAuthenticate = 4000;

        //     uws.server.on('connected', (client: Client<BasicContext>) => {
        //         client.close(FailedToAuthenticate);
        //     });

        //     uws.client = new UniversalWebSocket(HOST, { retryConnectionStatusCodes: [FailedToAuthenticate] });
        //     uws.client.on('disconnected', (code) => {
        //         expect(code, `Recieved custom close status code: ${FailedToAuthenticate}`).to.equal(FailedToAuthenticate);
        //         // Clean up
        //         uws.server.removeAllListeners('disconnected');
        //         uws.client.close();
        //         uws.server.removeAllListeners('connected');
        //         delete uws.client;
        //         done();
        //     });
        // });

        it('Connect to the server with credentials', function (done) {
            const name = 'Client 2';
            const password = 'supersecurepassword';
            uws.client = new UniversalWebSocket(HOST, undefined, name, password);
            uws.server.on('connected', (client: Client<BasicContext>) => {
                expect(client.parameters).to.exist;
                expect(client.parameters).to.be.an('array');
                const [_name, _password] = client.parameters!;
                expect(_name, `UWS Server's client's name is ${name}`).to.equal(name);
                expect(_password, `UWS Server's client's password is ${password}`).to.equal(password);
                // Clean up
                uws.server.removeAllListeners('connected');
                delete uws.client;
                done();
            });

        });

        it('Client sends a message which the Server receives', function (done) {
            const message = `UWS Servers can handle a message directly`;

            uws.server.on(`#${message}`, (client: Client<BasicContext>, data?: any) => {
                expect(client, `UWS Server's client exists`).to.exist;
                expect(data, `Client did not send data`).to.not.exist;
                complete();
            });

            uws.client = new UniversalWebSocket(HOST);
            uws.client.on('connected', (client) => {
                uws.client.send(message);
            });

            function complete() {
                uws.server.removeAllListeners(`#${message}`);
                done();
            }
        });

        it(`Client sends a message which the Server's Client receives`, function (done) {
            const message = `Or UWS Servers can handle messages with their client instances`;

            uws.server.on('connected', (client: Client<BasicContext>) => {
                expect(client, `UWS Server's client exists`).to.exist;

                client.on(`#${message}`, (data?: any) => {
                    expect(data, `Client did not send data`).to.not.exist;

                    // Clean up listeners
                    uws.server.removeAllListeners('connected');
                    expect(client.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
                    client.removeAllListeners(`#${message}`);
                    expect(client.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);
                    done();
                });
            });

            uws.client = new UniversalWebSocket(HOST);
            uws.client.send(message);
        });

        it(`Client makes server request`, function (done) {
            const endpoint = `some data`;
            const parameter = `some parameter`;
            const response = 'the data';
            uws.server.on(`@${endpoint}`, (client, data, callback) => {
                expect(data, `Client did not send data`).to.exist;
                expect(data, `Data incorrect`).to.equal(parameter);
                callback(response);
            });

            uws.client = new UniversalWebSocket(HOST);
            uws.client.request<string>(endpoint, parameter).then((res) => {
                expect(res, `Response incorrect`).to.equal(response);
                done();
            });
        });

        // it('Client sends a message with data which the Server receives', function (done) {
        //     const message = `UWS Servers can send data in addition to the message`;
        //     const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };
        //     client.send(message, data);

        //     server.on(`#${message}`, (client: Client<BasicContext>, receivedData?: any) => {
        //         expect(client, `UWS Server's client exists`).to.exist;
        //         expect(receivedData, `UWS Server received data`).to.exist;
        //         expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);

        //         done();
        //     });

        // });

        // it(`Client sends a message with data which the Server's Client receives`, function (done) {
        //     const message = `Or UWS Servers can handle messages with their client instances`;
        //     const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };

        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         expect(sClient, `UWS Server's client exists`).to.exist;

        //         sClient.on(`#${message}`, (receivedData?: any) => {
        //             expect(receivedData, `UWS Server received data`).to.exist;
        //             expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);

        //             // Clean up listeners
        //             server.removeAllListeners('connected');
        //             expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
        //             sClient.removeAllListeners(`#${message}`);
        //             expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);

        //             done();
        //         });
        //     });

        //     client = new UniversalWebSocket(HOST);
        //     client.send(message, data);
        // });

        // it(`Server sends a message which the Client receives`, function (done) {
        //     const message = `UWS Clients can receive messages sent from the server directly`;
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         server.send(sClient, message);
        //     });

        //     client = new UniversalWebSocket(HOST);

        //     client.on(`#${message}`, (receivedData?: any) => {
        //         expect(receivedData, `Client received no data from server`).to.not.exist;

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
        //         server.removeAllListeners('connected');
        //         expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

        //         done();
        //     });
        // });

        // it(`Server's client instance sends a message which the Client receives`, function (done) {
        //     const message = `UWS Server's client instance can also send a message`;
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         sClient.send(message);
        //     });

        //     client = new UniversalWebSocket(HOST);

        //     client.on(`#${message}`, (receivedData?: any) => {
        //         expect(receivedData, `Client received no data from server`).to.not.exist;

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
        //         server.removeAllListeners('connected');
        //         expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

        //         done();
        //     });
        // });

        // it(`Server sends a message with data which the Client receives`, function (done) {
        //     const message = `UWS Clients can receive messages sent from the server directly`;
        //     const data: number[] = [0, 1, 2, 4, 8, 16, 32];
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         server.send(sClient, message, data);
        //     });

        //     client = new UniversalWebSocket(HOST);

        //     client.on(`#${message}`, (receivedData?: number[]) => {
        //         expect(receivedData, `Client received data from server`).to.exist;
        //         expect(Array.isArray(receivedData), `Received data is an array`).to.be.true;

        //         if (receivedData) {
        //             expect(receivedData.length, `Received data array length to be ${data.length}`).to.equal(data.length);
        //             expect(receivedData.every((e, i) => data[i] === e), `Received data array elements are equivalent`).to.be.true;
        //         }

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
        //         server.removeAllListeners('connected');
        //         expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

        //         done();
        //     });
        // });

        // it(`Server's client instance sends a message with data which the Client receives`, function (done) {
        //     const message = `UWS Server's client instance can also send a message`;
        //     const data: number[] = [0, 1, 2, 4, 8, 16, 32];
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         sClient.send(message, data);
        //     });

        //     client = new UniversalWebSocket(HOST);

        //     client.on(`#${message}`, (receivedData?: number[]) => {
        //         expect(receivedData, `Client received data from server`).to.exist;
        //         expect(Array.isArray(receivedData), `Received data is an array`).to.be.true;

        //         if (receivedData) {
        //             expect(receivedData.length, `Received data array length to be ${data.length}`).to.equal(data.length);
        //             expect(receivedData.every((e, i) => data[i] === e), `Received data array elements are equivalent`).to.be.true;
        //         }

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
        //         server.removeAllListeners('connected');
        //         expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

        //         done();
        //     });
        // });
        // // SendWithAck
        // it('Client sends a message which the Server receives and acknowledges', function (done) {
        //     const message = `UWS Servers can acknowledge reception of a message`;
        //     client.sendWithAck(message).then(() => {
        //         done();
        //     }).catch((error) => {
        //         expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //         done();
        //     });

        //     server.on(`#${message}`, (client: Client<BasicContext>, data?: any) => {
        //         expect(client, `UWS Server's client exists`).to.exist;
        //         expect(data, `Client did not send data`).to.not.exist;
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
        //     });

        // });

        // it(`Client sends a message which the Server's Client receives and acknowledges`, function (done) {
        //     const message = `Or UWS Servers' client instances can acknowledge the message`;
        //     client.sendWithAck(message).then(() => {
        //         done();
        //     }).catch((error) => {
        //         expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //         done();
        //     });

        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         expect(sClient, `UWS Server's client exists`).to.exist;

        //         sClient.on(`#${message}`, (data?: any) => {
        //             expect(data, `Client did not send data`).to.not.exist;

        //             // Clean up listeners
        //             server.removeAllListeners('connected');
        //             expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
        //             sClient.removeAllListeners(`#${message}`);
        //             expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);
        //         });
        //     });
        // });

        // it('Client sends a message with data which the Server receives and acknowledges', function (done) {
        //     const message = `UWS Clients' sendWithAck are promises that resolve when the server acknowleges`;
        //     const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };
        //     client.sendWithAck(message, data).then(() => {
        //         done();
        //     }).catch((error) => {
        //         expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //         done();
        //     });

        //     server.on(`#${message}`, (client: Client<BasicContext>, receivedData?: any) => {
        //         expect(client, `UWS Server's client exists`).to.exist;
        //         expect(receivedData, `UWS Server received data`).to.exist;
        //         expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
        //     });
        // });

        // it(`Client sends a message with data which the Server's Client receives and acknowledges`, function (done) {
        //     const message = `Or UWS Clients' sendWithAck promise will reject with an Error if the UWS Server fails to acknowledge in time`;
        //     const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };
        //     client.sendWithAck(message, data).then(() => {
        //         done();
        //     }).catch((error) => {
        //         expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //         done();
        //     });

        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         expect(sClient, `UWS Server's client exists`).to.exist;

        //         sClient.on(`#${message}`, (receivedData?: any) => {
        //             expect(receivedData, `UWS Server received data`).to.exist;
        //             expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);

        //             // Clean up listeners
        //             server.removeAllListeners('connected');
        //             expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
        //             sClient.removeAllListeners(`#${message}`);
        //             expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);
        //         });
        //     });
        // });

        // it(`Server sends a message which the Client receives and acknowledges`, function (done) {
        //     const message = `UWS Servers can sendWithAck as well`;
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         server.sendWithAck(sClient, message).then(() => {
        //             done();
        //         }).catch((error) => {
        //             expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //             done();
        //         });
        //     });

        //     client = new UniversalWebSocket(HOST);

        //     client.on(`#${message}`, (receivedData?: any) => {
        //         expect(receivedData, `Client received no data from server`).to.not.exist;

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
        //     });
        // });
        // -------------------------

        // it(`Server's client instance sends a message which the Client receives and acknowledges`, function (done) {
        //     const message = `UWS Server's sendWithAck returns with a promise that will resolve when the client acknowledges the message`;
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         sClient.sendWithAck(message).then(() => {
        //             done();
        //         }).catch((error) => {
        //             expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //             done();
        //         });
        //     });

        //     client = new UniversalWebSocket(host);

        //     client.on(`#${message}`, (receivedData?: any) => {
        //         expect(receivedData, `Client received no data from server`).to.not.exist;

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
        //     });
        // });

        // it(`Server sends a message with data which the Client receives and acknowledges`, function (done) {
        //     const message = `UWS Server's sendWithAck promise will reject with an Error if the client fails to acknowledge the message`;
        //     const data: number[] = [0, 1, 2, 4, 8, 16, 32];
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         server.sendWithAck(sClient, message).then(() => {
        //             done();
        //         }).catch((error) => {
        //             expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //             done();
        //         });
        //     });

        //     client = new UniversalWebSocket(host);

        //     client.on(`#${message}`, (receivedData?: number[]) => {
        //         expect(receivedData, `Client received data from server`).to.exist;
        //         expect(Array.isArray(receivedData), `Received data is an array`).to.be.true;

        //         if (receivedData) {
        //             expect(receivedData.length, `Received data array length to be ${data.length}`).to.equal(data.length);
        //             expect(receivedData.every((e, i) => data[i] === e), `Received data array elements are equivalent`).to.be.true;
        //         }

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
        //     });
        // });

        // it(`Server's client instance sends a message with data which the Client receives and acknowledges`, function (done) {
        //     const message = `UWS Server's client instance can also request acknowledgements from the client`;
        //     const data: number[] = [0, 1, 2, 4, 8, 16, 32];
        //     server.on('connected', (sClient: Client<BasicContext>) => {
        //         sClient.sendWithAck(message).then(() => {
        //             done();
        //         }).catch((error) => {
        //             expect(error, 'Client acknowledgement should not fail').to.not.exist;

        //             done();
        //         });
        //     });

        //     client = new UniversalWebSocket(host);

        //     client.on(`#${message}`, (receivedData?: number[]) => {
        //         expect(receivedData, `Client received data from server`).to.exist;
        //         expect(Array.isArray(receivedData), `Received data is an array`).to.be.true;

        //         if (receivedData) {
        //             expect(receivedData.length, `Received data array length to be ${data.length}`).to.equal(data.length);
        //             expect(receivedData.every((e, i) => data[i] === e), `Received data array elements are equivalent`).to.be.true;
        //         }

        //         // Clean up listeners
        //         expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
        //         client.removeAllListeners(`#${message}`);
        //         expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
        //         expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
        //         server.removeAllListeners(`#${message}`);
        //         expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
        //     });
        // });

        // it(`Client sends a request with data which the server responds to with data`, function (done) {
        //     const requestMessage = `Clients can send requests to the server`;
        //     const requestData: { stuff: 'things' } = { stuff: 'things' };
        //     const response: { things: 'stuff' } = { things: 'stuff' };
        //     client.request(requestMessage, requestData).then((responseData: any) => {
        //         expect(responseData, `UWS Client received response from server`).to.exist;
        //         expect(responseData.things, `UWS Client received response is equivalent to what the server sent`).to.equal(response.things);

        //         done();
        //     }).catch((error) => {
        //         expect(error, `UWS Client should not receive error`).to.not.exist;

        //         done();
        //     });

        //     server.on(`@${requestMessage}`, (sClient: Client<BasicContext>, data: { stuff: 'things' }, callback: (data: any, ack?: boolean) => void | Promise<void>) => {
        //         expect(sClient, `UWS Server's client instance exists`).to.exist;
        //         expect(data, `UWS Server received data with request`).to.exist;
        //         expect(data.stuff, `UWS Server received data is equivalent to what the client sent`).to.equal(requestData.stuff);
        //         expect(callback, `UWS Server callback is provided`).to.exist;

        //         callback(response);
        //     });
        // });

        // it(`Client sends a request with data which the server responds to with data and expects acknowledgement`, function (done) {
        //     const requestMessage = `Clients can send requests to the server and acknowledge the response`;
        //     const requestData: { stuff: 'things' } = { stuff: 'things' };
        //     const response: { things: 'stuff' } = { things: 'stuff' };
        //     client.request(requestMessage, requestData).then((responseData: any) => {
        //         expect(responseData, `UWS Client received response from server`).to.exist;
        //         expect(responseData.things, `UWS Client received response is equivalent to what the server sent`).to.equal(response.things);
        //     }).catch((error) => {
        //         expect(error, `UWS Client should not receive error`).to.not.exist;
        //     });

        //     server.on(`@${requestMessage}`, (sClient: Client<BasicContext>, data: { stuff: 'things' }, callback: (data: any, ack?: boolean) => void | Promise<void>) => {
        //         expect(sClient, `UWS Server's client instance exists`).to.exist;
        //         expect(data, `UWS Server received data with request`).to.exist;
        //         expect(data.stuff, `UWS Server received data is equivalent to what the client sent`).to.equal(requestData.stuff);
        //         expect(callback, `UWS Server callback is provided`).to.exist;

        //         (callback as (data: any, ack?: boolean) => Promise<void>)(response, true).then(() => {
        //             done();
        //         }).catch((error) => {
        //             expect(error, `UWS Server should not receive Error`).to.not.exist;

        //             done();
        //         });
        //     });
        // });

        // it(`Server sends a request with data which the client responds to with data`, function (done) {
        //     const requestMessage = `Servers can also send requests to the client`;
        //     const requestData: { redFish: 'blueFish' } = { redFish: 'blueFish' };
        //     const response: { greenEggs: 'greenHam' } = { greenEggs: 'greenHam' };

        //     server.on('connected', (sClient: Client<BasicContext>) => {

        //     });

        //     client = new UniversalWebSocket(host);

        //     client.on(`@${requestMessage}`, (data: { redFish: 'blueFish' }, callback: (data: any, ack?: boolean) => void | Promise<void>) => {

        //     });

        //     client.request(requestMessage, requestData).then((responseData: any) => {
        //         expect(responseData, `UWS Client received response from server`).to.exist;
        //         expect(responseData.things, `UWS Client received response is equivalent to what the server sent`).to.equal(response.greenEggs);

        //         done();
        //     }).catch((error) => {
        //         expect(error, `UWS Client should not receive error`).to.not.exist;

        //         done();
        //     });

        //     server.on(`@${requestMessage}`, (sClient: Client<BasicContext>, data: { stuff: 'things' }, callback: (data: any, ack?: boolean) => void | Promise<void>) => {
        //         expect(sClient, `UWS Server's client instance exists`).to.exist;
        //         expect(data, `UWS Server received data with request`).to.exist;
        //         expect(data.stuff, `UWS Server received data is equivalent to what the client sent`).to.equal(requestData.stuff);
        //         expect(callback, `UWS Server callback is provided`).to.exist;

        //         callback(response);
        //     });
        // });

        // it(`Client sends a request with data which the server responds to with data and expects acknowledgement`, function (done) {
        //     const requestMessage = `Clients can send requests to the server and acknowledge the response`;
        //     const requestData: { stuff: 'things' } = { stuff: 'things' };
        //     const response: { things: 'stuff' } = { things: 'stuff' };
        //     client.request(requestMessage, requestData).then((responseData: any) => {
        //         expect(responseData, `UWS Client received response from server`).to.exist;
        //         expect(responseData.things, `UWS Client received response is equivalent to what the server sent`).to.equal(response.things);
        //     }).catch((error) => {
        //         expect(error, `UWS Client should not receive error`).to.not.exist;
        //     });

        //     server.on(`@${requestMessage}`, (sClient: Client<BasicContext>, data: { stuff: 'things' }, callback: (data: any, ack?: boolean) => void | Promise<void>) => {
        //         expect(sClient, `UWS Server's client instance exists`).to.exist;
        //         expect(data, `UWS Server received data with request`).to.exist;
        //         expect(data.stuff, `UWS Server received data is equivalent to what the client sent`).to.equal(requestData.stuff);
        //         expect(callback, `UWS Server callback is provided`).to.exist;

        //         (callback as (data: any, ack?: boolean) => Promise<void>)(response, true).then(() => {
        //             done();
        //         }).catch((error) => {
        //             expect(error, `UWS Server should not receive Error`).to.not.exist;

        //             done();
        //         });
        //     });
        // });

    });

});