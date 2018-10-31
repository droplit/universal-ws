import { EventEmitter } from 'events';
import * as http from 'http';
import { Transport, StatusCode } from './transport';
import * as WebSocket from 'ws';

const ObjectId = require('bson-objectid');

export { StatusCode } from './transport';
export { PerMessageDeflateOptions } from 'ws';

export interface WsOptions {
    pollRate?: number | { minimum: number, maximum: number };
    timeout?: number | { minimum: number, maximum: number };
    conserveBandwidth: boolean;
}
export interface WsContext<Context = any> extends WebSocket {
    context?: Context;
    lastHeartbeat: Date;
    rpcTransactions: {
        [transactionId: string]: {
            timer: any;
            callback: (response: any, error?: any) => void;
        }
    };
    pollRate: number;
    timeout: number;
    expires: any;
}

export interface StandardPacket {
    t?: 'hb' | 'hbr' | 'hbrx' | 'hbtx' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

enum PacketType {
    Heartbeat,
    HeartbeatRequest,
    HeartbeatReceive,
    HeartbeatTransmit,
    Message,
    Request,
    Response,
    Acknowledgement
}

export class Session<Context = any> extends EventEmitter {

    private transport: Transport;
    private authenticator?: (connection: WsContext<Context>) => Promise<boolean>;
    private pollRate = { minimum: 1000, maximum: 10000 };
    private timeout = { minimum: 20000, maximum: 60000 };
    private conserveBandwidth = false;
    public connections: WsContext<Context>[] = [];

    constructor(
        server: http.Server,
        authenticator?: (connection: WsContext<Context>) => Promise<boolean>,
        perMessageDeflate?: WebSocket.PerMessageDeflateOptions,
        options?: WsOptions) {
        super();
        this.transport = new Transport(server, perMessageDeflate);
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
            this.conserveBandwidth = options.conserveBandwidth ? true : false;
        }

        this.transport.on('connection', (connection: WsContext<Context>) => {
            this.emit('connection', connection);
            connection.timeout = 60000;
            connection.pollRate = this.conserveBandwidth ? this.pollRate.minimum : this.pollRate.maximum;
            connection.expires = setTimeout(() => {
                this.onConnectionInactive(connection);
            }, connection.timeout);
            if (authenticator) {
                this.authenticator = authenticator;
                authenticator(connection)
                    .then((result) => {
                        if (result) {
                            this.onConnectionActive(connection);
                            this.connectionReady(connection);
                            this.connections.push(connection);
                            this.emit('connected', connection);
                        } else {
                            this.emit('disconnected', connection);
                            connection.close(1008, JSON.stringify({ code: 1008, reason: 'auth' }));
                        }
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

        this.transport.on('close', (connection: WsContext<Context>, code: number, message: string) => {
            this.emit('close', connection, code, message);
            this.onConnectionInactive(connection);
        });
    }

    private connectionReady(connection: WsContext<Context>) {
        connection.context = <Context>{};
    }

    private onConnectionActive(connection: WsContext<Context>) {
        if (!connection.context) {
            return;
        } else {
            this.renewHeartbeat(connection);
        }
    }

    private onConnectionInactive(connection: WsContext<Context>) {
        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
            connection.close();
            this.emit('disconnected', connection);
        } else {
            this.emit('disconnected', connection);
        }
    }

    private renewHeartbeat(connection: WsContext<Context>) {
        clearTimeout(connection.expires);
        connection.expires = setTimeout(() => {
            this.onConnectionInactive(connection);
        }, connection.timeout);
        connection.lastHeartbeat = new Date();
    }

    private onMessage(connection: WsContext<Context>, message: any) {
        this.onConnectionActive(connection);

        // Empty message
        if (!message) {
            return;
        }

        // Binary message
        if (Buffer.isBuffer(message)) {
            return;
        }

        let packet: StandardPacket;

        // parse packet JSON
        try {
            packet = JSON.parse(message);
        } catch (error) {
            // throw?
            throw new Error('Invalid packet');
        }

        switch (this.getPacketType(packet)) {
            case PacketType.Heartbeat: // Heartbeat from client, already handled by onConnectionActive
                this.handleHeartbeat(connection, packet);
                break;
            case PacketType.HeartbeatRequest:
                this.handleHeartbeatRequest(connection, packet);
                break;
            case PacketType.HeartbeatReceive:
                this.handleHeartbeatReceive(connection, packet);
                break;
            case PacketType.HeartbeatTransmit:
                this.handleHeartbeatTransmit(connection, packet);
                break;
            case PacketType.Message:
                this.handleMessage(connection, packet);
            case PacketType.Request:
                this.handleRequest(connection, packet);
                break;
            case PacketType.Response:
                this.handleResponse(connection, packet);
                break;
            case PacketType.Acknowledgement:
                this.handleAcknowledgement(connection, packet);
                break;
            default:
                throw new Error('Invalid packet received');
        }
    }

    private getPacketType(packet: StandardPacket) {
        if (packet.r) { // Handle request/response control
            if (typeof packet.r === 'number') { // Incrementing number indicates a request from the client
                return PacketType.Request;
            } else if (typeof packet.r === 'string') { // Random string originates from the server's request
                return PacketType.Response;
            } else {
                // Do a throw and handle it somehow and emit some kind of event
                return; // Invalid packet
            }
        } else if (packet.t) { // Handle Heartbeat & Acknowledgement
            switch (packet.t) {
                case 'hb': // Client sends heartbeat to server
                    return PacketType.Heartbeat;
                case 'hbr': // Client requests a heartbeat from the server
                    return PacketType.HeartbeatRequest;
                case 'hbrx': // Client requests a change in server polling rate or client timeout
                    return PacketType.HeartbeatReceive;
                case 'hbtx': // Client requests a change in client polling rate or server timeout
                    return PacketType.HeartbeatTransmit;
                default: // Client acknowledges a response from the server
                    return PacketType.Acknowledgement;
            }
        } else { // Handle simple messages from the client
            return PacketType.Message; // Simple message from the client
        }
    }

    private handleHeartbeat(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        this.emit('heartbeat', connection.context);
    }

    private handleHeartbeatRequest(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        this.transport.send(connection, JSON.stringify({ t: 'hb' }));
        // connection.send(JSON.stringify({ t: 'hb' }));
    }

    private handleHeartbeatReceive(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        switch (packet.m) {
            case 'p': // Client requests server to adjust polling rate
            case 't': // Client requests to adjust client timeout
            default: // Invalid hbrx message
        }
        // negotiateHbrx(connection: WsContext<Context>, message: 'p' | 't' | string, data: { min: number, max: number }) {
        //     if (message === 'p') {
        //         // Client requests server to adjust polling rate
        //         if (this.conserveBandwidth) {
        //             // Set the connection to the highest
        //             connection.pollRate = Math.min(connection.timeout, Math.max(this.pollRate.maximum, data.max));
        //             // if (connection.pollRate > Math.max(data.max, ))
        //         } else {

        //         }
        //     } else if (message === 't') {
        //         // Client requests to adjust client timeout
        //     } else {
        //         // Invalid hbrx message
        //     }
        // }
    }

    private handleHeartbeatTransmit(connection: WsContext<Context>, packet: Partial<StandardPacket>) {

    }

    private handleMessage(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        this.emit(`@${packet.m}`, packet.i, packet.d, connection.context, (result: any) => { });
    }

    private handleRequest(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        // Handle request expecting a response
        this.emit(`#${packet.m}`, packet.r, packet.d, connection.context, (result: any, timeout: number = 5000, onAcknowledge?: (response: any, error?: any) => void) => {
            const response: Partial<StandardPacket> = {
                m: packet.m,
                d: result,
                r: packet.r
            };
            if (onAcknowledge) {
                const acknowledgementId: string = ObjectId();
                response.t = acknowledgementId;
                if (!connection.rpcTransactions) connection.rpcTransactions = {};
                connection.rpcTransactions[acknowledgementId] = {
                    callback: (response: any, error?: any) => {
                        // Clear and delete rpc
                        clearTimeout(connection.rpcTransactions[acknowledgementId].timer);
                        delete connection.rpcTransactions[acknowledgementId];
                        if (error) {
                            onAcknowledge(undefined, error);
                        } else {
                            onAcknowledge(response);
                        }
                    },
                    timer: setTimeout(() => {
                        // Timed out in acknowledging response
                        connection.rpcTransactions[acknowledgementId].callback(undefined, 'Acknowledgement timed out');
                    }, timeout)
                };
            } else {
                return Promise.resolve();
            }

            this.transport.send(connection, JSON.stringify(response));
            // connection.send(JSON.stringify(response));
        });
    }

    private handleResponse(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        if (typeof packet.r !== 'string') return;
        if (connection.rpcTransactions[packet.r]) {
            if (packet.t) { // Client expects acknowledgement of response
                this.transport.send(connection, JSON.stringify({ t: packet.t }));
                // connection.send(JSON.stringify({ t: packet.t }));
            }
            connection.rpcTransactions[packet.r].callback(packet.d);
        }
    }

    private handleAcknowledgement(connection: WsContext<Context>, packet: Partial<StandardPacket>) {
        if (typeof packet.t !== 'string') return;
        if (connection.rpcTransactions[packet.t]) {
            connection.rpcTransactions[packet.t].callback(undefined);
        }
    }

    public requestAuthentication(connection: WsContext<Context>, onAuthenticated: (error?: any) => void) {
        if (this.authenticator) {
            this.authenticator(connection)
                .then((result) => {
                    if (result) {
                        this.onConnectionActive(connection);
                        this.connectionReady(connection);
                        this.emit('authenticated', connection);
                        onAuthenticated();
                    } else {
                        this.onConnectionInactive(connection);
                        onAuthenticated('Failed to authenticate');
                    }
                })
                .catch((error) => {
                    this.onConnectionInactive(connection);
                    onAuthenticated('Failed to authenticate');
                });
        } else {
            onAuthenticated();
            this.emit('authenticated', connection);

        }
    }

    public sendMessage(connection: WsContext<Context>, message: string, data?: any) {
        const packet: Partial<StandardPacket> = {
            m: message
        };
        if (data) {
            packet.d = data;
        }
        this.transport.send(connection, JSON.stringify(packet));
        // connection.send(JSON.stringify(packet));
    }

    public makeRequest(connection: WsContext<Context>, message: string, data: any = {}, callback: (response: any, error?: any) => void) {
        const requestId: string = ObjectId();
        const packet: Partial<StandardPacket> = {
            m: message,
            d: data,
            // r: message,
            r: requestId
        };

        this.transport.send(connection, JSON.stringify(packet));
        // connection.send(JSON.stringify(packet));

        if (!connection.rpcTransactions) connection.rpcTransactions = {};
        connection.rpcTransactions[requestId] = {
            callback: (response: any, error: any) => {
                // Clear and delete rpc
                clearTimeout(connection.rpcTransactions[requestId].timer);
                delete connection.rpcTransactions[requestId];
                if (error) {
                    callback(undefined, error);
                } else {
                    callback(response);
                }
            },
            timer: setTimeout(() => {
                // Timed out in acknowledging response
                connection.rpcTransactions[requestId].callback(undefined, 'No response from client connection. Request timed out');
            }, connection.timeout)
        };
    }

    public close(connection: WsContext<Context>, code: StatusCode, message?: string) {
        this.transport.close(connection, code, message);
    }

}