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
        const host = `ws://localhost:${PORT}`;

        let httpServer: http.Server;
        let server: UniversalWebSocketServer<BasicContext>;
        let client: UniversalWebSocket;
        let authenticatedClient: UniversalWebSocket;

        it('Initialize server', function (done) {
            httpServer = http.createServer();
            httpServer.listen(PORT);
            server = new UniversalWebSocketServer(httpServer);

            expect(httpServer, 'HTTP Server exists').to.exist;
            expect(server, 'UWS Server exists').to.exist;

            done();
        });

        it('Initialize client and connect to the server', function (done) {
            const name = 'Client 1';
            client = new UniversalWebSocket(host, undefined, name);

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(client, 'UWS Client exists').to.exist;
                expect(sClient, `UWS Server's Client instance exists`).to.exist;
                expect(sClient.parameters, 'UWS Server Client has name').to.exist;
                if (sClient.parameters && Array.isArray(sClient.parameters)) expect(sClient.parameters[0], `UWS Server's client's name is ${name}`).to.equal(name);
                expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                // Clean up listeners
                server.removeAllListeners('connected');
                expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

                done();
            });
        });

        it('Initialize authenticated client and connect to the server', function (done) {
            const name = 'Client 2';
            authenticatedClient = new UniversalWebSocket(host, undefined, 'Client 2', 'supersecurepassword');

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(authenticatedClient, 'UWS Client exists').to.exist;
                expect(sClient, `UWS Server's Client instance exists`).to.exist;
                expect(sClient.parameters, `UWS Server's Client instance has parameters provided by client`).to.exist;
                if (sClient.parameters && Array.isArray(sClient.parameters)) expect(sClient.parameters[0], `UWS Server's client instance first parameter is ${name}`).to.equal(name);
                expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                // Clean up listeners
                server.removeAllListeners('connected');
                expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

                done();
            });
        });

        it('Client sends a message which the Server receives', function (done) {
            const message = `UWS Servers can handle a message directly`;
            client.send(message);

            server.on(`#${message}`, (client: Client<BasicContext>, data?: any) => {
                expect(client, `UWS Server's client exists`).to.exist;
                expect(data, `Client did not send data`).to.not.exist;
                expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
                server.removeAllListeners(`#${message}`);
                expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);

                done();
            });

        });

        it(`Client sends a message which the Server's Client receives`, function (done) {
            const message = `Or UWS Servers can handle messages with their client instances`;

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(sClient, `UWS Server's client exists`).to.exist;

                sClient.on(`#${message}`, (data?: any) => {
                    expect(data, `Client did not send data`).to.not.exist;

                    // Clean up listeners
                    server.removeAllListeners('connected');
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
                    sClient.removeAllListeners(`#${message}`);
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);

                    done();
                });
            });

            client = new UniversalWebSocket(host);
            client.send(message);

        });

        it('Client sends a message with data which the Server receives', function (done) {
            const message = `UWS Servers can send data in addition to the message`;
            const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };
            client.send(message, data);

            server.on(`#${message}`, (client: Client<BasicContext>, receivedData?: any) => {
                expect(client, `UWS Server's client exists`).to.exist;
                expect(receivedData, `UWS Server received data`).to.exist;
                expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);
                expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
                server.removeAllListeners(`#${message}`);
                expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);

                done();
            });

        });

        it(`Client sends a message with data which the Server's Client receives`, function (done) {
            const message = `Or UWS Servers can handle messages with their client instances`;
            const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(sClient, `UWS Server's client exists`).to.exist;

                sClient.on(`#${message}`, (receivedData?: any) => {
                    expect(receivedData, `UWS Server received data`).to.exist;
                    expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);

                    // Clean up listeners
                    server.removeAllListeners('connected');
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
                    sClient.removeAllListeners(`#${message}`);
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);

                    done();
                });
            });

            client = new UniversalWebSocket(host);
            client.send(message, data);
        });

        it(`Server sends a message which the Client receives`, function (done) {
            const message = `UWS Clients can receive messages sent from the server directly`;
            server.on('connected', (sClient: Client<BasicContext>) => {
                server.send(sClient, message);
            });

            client = new UniversalWebSocket(host);

            client.on(`#${message}`, (receivedData?: any) => {
                expect(receivedData, `Client received no data from server`).to.not.exist;

                // Clean up listeners
                expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
                client.removeAllListeners(`#${message}`);
                expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
                expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                server.removeAllListeners('connected');
                expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

                done();
            });
        });

        it(`Server's client instance sends a message which the Client receives`, function (done) {
            const message = `UWS Server's client instance can also send a message`;
            server.on('connected', (sClient: Client<BasicContext>) => {
                sClient.send(message);
            });

            client = new UniversalWebSocket(host);

            client.on(`#${message}`, (receivedData?: any) => {
                expect(receivedData, `Client received no data from server`).to.not.exist;

                // Clean up listeners
                expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
                client.removeAllListeners(`#${message}`);
                expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
                expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                server.removeAllListeners('connected');
                expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

                done();
            });
        });

        it(`Server sends a message with data which the Client receives`, function (done) {
            const message = `UWS Clients can receive messages sent from the server directly`;
            const data: number[] = [0, 1, 2, 4, 8, 16, 32];
            server.on('connected', (sClient: Client<BasicContext>) => {
                server.send(sClient, message, data);
            });

            client = new UniversalWebSocket(host);

            client.on(`#${message}`, (receivedData?: number[]) => {
                expect(receivedData, `Client received data from server`).to.exist;
                expect(Array.isArray(receivedData), `Received data is an array`).to.be.true;

                if (receivedData) {
                    expect(receivedData.length, `Received data array length to be ${data.length}`).to.equal(data.length);
                    expect(receivedData.every((e, i) => data[i] === e), `Received data array elements are equivalent`).to.be.true;
                }

                // Clean up listeners
                expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
                client.removeAllListeners(`#${message}`);
                expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
                expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                server.removeAllListeners('connected');
                expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

                done();
            });
        });

        it(`Server's client instance sends a message with data which the Client receives`, function (done) {
            const message = `UWS Server's client instance can also send a message`;
            const data: number[] = [0, 1, 2, 4, 8, 16, 32];
            server.on('connected', (sClient: Client<BasicContext>) => {
                sClient.send(message, data);
            });

            client = new UniversalWebSocket(host);

            client.on(`#${message}`, (receivedData?: number[]) => {
                expect(receivedData, `Client received data from server`).to.exist;
                expect(Array.isArray(receivedData), `Received data is an array`).to.be.true;

                if (receivedData) {
                    expect(receivedData.length, `Received data array length to be ${data.length}`).to.equal(data.length);
                    expect(receivedData.every((e, i) => data[i] === e), `Received data array elements are equivalent`).to.be.true;
                }

                // Clean up listeners
                expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
                client.removeAllListeners(`#${message}`);
                expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
                expect(server.listeners('connected').length, `UWS Server has 1 "connected" listener`).to.equal(1);
                server.removeAllListeners('connected');
                expect(server.listeners('connected').length, `UWS Server successfully removed "connected" listener(s)`).to.equal(0);

                done();
            });
        });
        // SendWithAck
        it('Client sends a message which the Server receives and acknowledges', function (done) {
            const message = `UWS Servers can acknowledge reception of a message`;
            client.sendWithAck(message).then(() => {
                done();
            }).catch((error) => {
                expect(error, 'Client acknowledgement should not fail').to.not.exist;

                done();
            });

            server.on(`#${message}`, (client: Client<BasicContext>, data?: any) => {
                expect(client, `UWS Server's client exists`).to.exist;
                expect(data, `Client did not send data`).to.not.exist;
                expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
                server.removeAllListeners(`#${message}`);
                expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
            });

        });

        it(`Client sends a message which the Server's Client receives and acknowledges`, function (done) {
            const message = `Or UWS Servers' client instances can acknowledge the message`;
            client.sendWithAck(message).then(() => {
                done();
            }).catch((error) => {
                expect(error, 'Client acknowledgement should not fail').to.not.exist;

                done();
            });

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(sClient, `UWS Server's client exists`).to.exist;

                sClient.on(`#${message}`, (data?: any) => {
                    expect(data, `Client did not send data`).to.not.exist;

                    // Clean up listeners
                    server.removeAllListeners('connected');
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
                    sClient.removeAllListeners(`#${message}`);
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);
                });
            });
        });

        it('Client sends a message with data which the Server receives and acknowledges', function (done) {
            const message = `UWS Clients' sendWithAck are promises that resolve when the server acknowleges`;
            const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };
            client.sendWithAck(message, data).then(() => {
                done();
            }).catch((error) => {
                expect(error, 'Client acknowledgement should not fail').to.not.exist;

                done();
            });

            server.on(`#${message}`, (client: Client<BasicContext>, receivedData?: any) => {
                expect(client, `UWS Server's client exists`).to.exist;
                expect(receivedData, `UWS Server received data`).to.exist;
                expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);
                expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
                server.removeAllListeners(`#${message}`);
                expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
            });
        });

        it(`Client sends a message with data which the Server's Client receives and acknowledges`, function (done) {
            const message = `Or UWS Clients' sendWithAck promise will reject with an Error if the UWS Server fails to acknowledge in time`;
            const data: any = { aStringArray: ['', ' ', '  '], aNumber: 5, aBoolean: true };
            client.sendWithAck(message, data).then(() => {
                done();
            }).catch((error) => {
                expect(error, 'Client acknowledgement should not fail').to.not.exist;

                done();
            });

            server.on('connected', (sClient: Client<BasicContext>) => {
                expect(sClient, `UWS Server's client exists`).to.exist;

                sClient.on(`#${message}`, (receivedData?: any) => {
                    expect(receivedData, `UWS Server received data`).to.exist;
                    expect(Object.keys(receivedData).every((key) => !!data[key]), `UWS Server received data with the same keys`).to.equal(true);

                    // Clean up listeners
                    server.removeAllListeners('connected');
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client has 1 "#${message}" listener`).to.equal(1);
                    sClient.removeAllListeners(`#${message}`);
                    expect(sClient.listeners(`#${message}`).length, `UWS Server's client successfully removed "#${message}" listener(s)`).to.equal(0);
                });
            });
        });

        it(`Server sends a message which the Client receives and acknowledges`, function (done) {
            const message = `UWS Servers can sendWithAck as well`;
            server.on('connected', (sClient: Client<BasicContext>) => {
                server.sendWithAck(sClient, message).then(() => {
                    done();
                }).catch((error) => {
                    expect(error, 'Client acknowledgement should not fail').to.not.exist;

                    done();
                });
            });

            client = new UniversalWebSocket(host);

            client.on(`#${message}`, (receivedData?: any) => {
                expect(receivedData, `Client received no data from server`).to.not.exist;

                // Clean up listeners
                expect(client.listeners(`#${message}`).length, `UWS Client has 1 "#${message}" listener`).to.equal(1);
                client.removeAllListeners(`#${message}`);
                expect(client.listeners(`#${message}`).length, `UWS Client successfully removed "#${message}" listener`).to.equal(0);
                expect(server.listeners(`#${message}`).length, `UWS Server has 1 "#${message}" listener`).to.equal(1);
                server.removeAllListeners(`#${message}`);
                expect(server.listeners(`#${message}`).length, `UWS Server successfully removed "#${message}" listener(s)`).to.equal(0);
            });
        });

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