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
    pollRate: number;
    timeout: number;
    heartbeatRequests: any[];
}

export interface StandardPacket {
    t?: 'hb' | 'hbr' | 'hbrx' | 'hbtx' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

export class Session extends EventEmitter {

    private transport: Transport;
    private authenticator?: (connection: WsContext) => Promise<boolean>;
    private pollRate = { minimum: 1000, maximum: 10000 };
    private timeout = { minimum: 20000, maximum: 60000 };
    private conserveBandwidth = false;
    public connections: WsContext[] = [];

    constructor(
        server: http.Server,
        authenticator?: (connection: WsContext) => Promise<boolean>,
        options?: {
            pollRate?: number | { minimum: number, maximum: number },
            timeout?: number | { minimum: number, maximum: number },
            conserveBandwidth: boolean;
        }) {
        super();
        this.transport = new Transport(server);
        if (options) {
            if (options.pollRate) {
                if (typeof options.pollRate === 'number') {
                    this.pollRate.minimum = this.pollRate.maximum = options.pollRate;
                } else if (typeof options.pollRate === 'object'
                    && options.pollRate !== null
                    && typeof options.pollRate.minimum === 'number'
                    && typeof options.pollRate.maximum === 'number'
                    && options.pollRate.minimum > 0) {
                    if (options.pollRate.maximum > options.pollRate.minimum) {
                        this.pollRate = options.pollRate;
                    } else {
                        throw new Error('Pollrate maximum must be larger than minimum');
                    }
                } else {
                    throw new Error('Pollrate must be a positive integer or an object containing minimum or maximum positive integers');
                }
            }
            if (options.timeout) {
                if (typeof options.timeout === 'number') {
                    if (options.timeout > this.pollRate.maximum) {
                        this.timeout.minimum = this.timeout.maximum = options.timeout;
                    } else {
                        throw new Error('Timeout must be larger than pollrate maximum');
                    }
                } else if (typeof options.timeout === 'object'
                    && options.timeout !== null
                    && typeof options.timeout.minimum === 'number'
                    && typeof options.timeout.maximum === 'number'
                    && options.timeout.minimum > 0) {
                    if (options.timeout.maximum > options.timeout.minimum) {
                        if (options.timeout.maximum > this.pollRate.maximum) {
                            if (options.timeout.minimum > this.pollRate.minimum) {
                                this.timeout = options.timeout;
                            } else {
                                throw new Error('Timeout minimum must be larger than pollrate minimum');
                            }
                        } else {
                            throw new Error('Timeout maximum must be larger than pollrate maximum');
                        }
                    } else {
                        throw new Error('Timeout maximum must be larger than minimum');
                    }
                } else {
                    throw new Error('Timeout must be a positive integer or an object containing minimum or maximum positive integers');
                }
            }
            if (options.conserveBandwidth) {
                this.conserveBandwidth = true;
            } else {
                this.conserveBandwidth = false;
            }
        }

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
                this.onConnectionActive(connection);
                this.connectionReady(connection);
                this.connections.push(connection);
                this.emit('connected', connection);
            }

            connection.on('message', (data) => {
                this.onMessage(connection, data);
            });
        });

        this.transport.on('close', (connection: WsContext, code: number, message: string) => {
            this.emit('close', connection, code, message);
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

    private onConnectionInactive(connection: WsContext) {
        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
            connection.close();
            this.emit('disconnected', connection);
        } else {
            throw new Error('Connection not found in list');
        }
    }

    private renewHeartbeat(connection: WsContext) {
        connection.heartbeatRequests.forEach((hrq) => {
            clearTimeout(connection.heartbeatRequests.pop());
        });
        connection.lastHeartbeat = new Date();
    }

    private expireConnections() {
        this.connections.forEach((connection) => {
            const difference = Math.abs(new Date().valueOf() - connection.lastHeartbeat.valueOf());
            if (difference > this.timeout) {
                this.onConnectionInactive(connection);
            }
        });
    }

    private negotiateHbrx(connection: WsContext, message: 'p' | 't' | string, data: { min: number, max: number }) {
        if (message === 'p') {
            // Client requests server to adjust polling rate
            if (this.conserveBandwidth) {
                // Set the connection to the highest 
                connection.pollRate = Math.min(connection.timeout, Math.max(this.pollRate.maximum, data.max));
                if (connection.pollRate > Math.max(data.max, ))
            } else {

            }
        } else if (message === 't') {
            // Client requests to adjust client timeout
        } else {
            // Invalid hbrx message
        }
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

            // Handle Heartbeat is this necessary due to above onConnectionActive
            switch (packet.t) {
                case 'hb':
                    break;
                case 'hbr': // Client requests a heartbeat from the server
                    connection.send(JSON.stringify({ t: 'hb' }));
                    break;
                case 'hbrx': // Client requests a change in server polling rate or client timeout
                    this.negotiateHbrx(connection, packet.m as string, packet.d);
                case 'hbtx': // Client requests a change in client polling rate or server timeout
                    this.negotiateHbtx(connection, packet.m, packet.d);
                default: break;
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