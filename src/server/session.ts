import { EventEmitter } from 'events';
import * as http from 'http';
import { Transport } from './transport';
import * as WebSocket from 'ws';

const ObjectId = require('bson-objectid');

export interface WsContext<Context = any> extends WebSocket {
    context: Context;
    lastHeartbeat: Date;
    waiting: (() => void)[];
    acknowledgements: {
        [ackId: string]: {
            timer: any;
            callback: (response: any, error: any) => Promise<any>;
        }
    };
}

export interface StandardPacket {
    t?: 'hb' | 'hbr' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

export class Session extends EventEmitter {

    private transport: Transport;
    private authenticator?: (connection: WsContext) => Promise<boolean>;
    public connections: WsContext[] = [];

    constructor(server: http.Server, authenticator?: (connection: WsContext) => Promise<boolean>) {
        super();
        this.transport = new Transport(server);

        this.transport.on('connection', (connection: WsContext) => {
            this.emit('connection', connection);
            if (authenticator) {
                this.authenticator = authenticator;
                authenticator(connection)
                    .then((result) => {

                        this.onConnectionActive(connection);
                        this.connectionReady(connection);
                        this.connections.push(connection);
                        this.emit('connected', connection);
                    })
                    .catch((error) => {
                        this.emit('disconnected', connection);
                        connection.close(1008, JSON.stringify({ code: 1008, reason: 'auth' }));
                    });
            } else {
                this.authenticator = (connection) => Promise.resolve(true);
                // No need to authenticate
                this.renewHeartbeat(connection);
                this.connections.push(connection);
                this.emit('connected', connection);
            }

            connection.on('message', (data) => {
                this.onMessage(connection, data);
            });
        });
    }

    private awaitReady(connection: WsContext, callback: () => void) {
        if (connection.context) {
            process.nextTick(callback);
        } else {
            connection.waiting = connection.waiting || [];
            connection.waiting.push(callback);
        }
    }

    private connectionReady(connection: WsContext) {
        if (connection.waiting) {
            connection.waiting.forEach((callback) => {
                process.nextTick(callback);
            });
            delete connection.waiting;
        }
    }

    private onConnectionActive(connection: WsContext) {
        if (!connection.context) {
            return;
        } else {
            this.renewHeartbeat(connection);
        }
    }

    private renewHeartbeat(connection: WsContext) {
        connection.lastHeartbeat = new Date();
    }

    private onMessage(connection: WsContext, message: any) {
        this.onConnectionActive(connection);

        // Empty message
        if (!message) {
            return;
        }

        // Binary message
        if (Buffer.isBuffer(message)) {
            return;
        }

        this.awaitReady(connection, () => {
            let packet: StandardPacket;

            // parse packet JSON
            try {
                packet = JSON.parse(message);
            } catch (error) {
                // throw?
                throw new Error('Invalid packet');
            }

            // Handle Heartbeat is this necessary due to above onConnection
            if (packet.t === 'hb') {
                this.renewHeartbeat(connection);
            } else if (packet.t === 'hbr') {
                // Send connection a heartbeat response?

                this.renewHeartbeat(connection);
            }

            if (packet.r === undefined) {
                // Handle message
                this.emit('message', packet.m, packet.i, packet.d, connection.context, (result: any) => {
                    // Done
                });
            } else if (packet.r === true) {
                // Handle request expecting a response
                this.emit('request', packet.m, packet.i, packet.d, connection.context, (result: any, expectAcknowledgement: boolean = false, timeout: number = 5000) => {
                    const response: Partial<StandardPacket> = {
                        m: JSON.stringify(packet.m),
                        d: result,
                        r: JSON.stringify(packet.i)
                    };
                    if (expectAcknowledgement) {
                        const ackId: string = ObjectId();
                        response.t = ackId;
                        connection.acknowledgements[ackId] = {
                            callback: (response: any, error: any) => {
                                if (error) {
                                    return Promise.reject(error);
                                } else {
                                    return Promise.resolve(response);
                                }
                            },
                            timer: setTimeout(() => {
                                // Timed out in acknowledging response
                                clearTimeout(connection.acknowledgements[ackId].timer);
                                connection.acknowledgements[ackId].callback(undefined, 'Acknowledgement timed out');
                                delete connection.acknowledgements[ackId];
                            }, timeout)
                        };
                    } else {
                        return Promise.resolve();
                    }

                    connection.send(JSON.stringify(response));
                });
            }
        });
    }

    public requestAuthentication(connection: WsContext) {
        if (this.authenticator) {
            this.authenticator(connection)
                .then((result) => {
                    if (result) {
                        this.onConnectionActive(connection);
                        this.connectionReady(connection);
                        this.emit('authenticated', connection);
                    }
                })
                .catch((error) => {
                    this.emit('disconnected', connection);
                });
        } else {
            this.emit('authenticated', connection);

        }
    }

}