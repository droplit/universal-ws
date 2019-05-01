import { EventEmitter } from 'events';
import * as http from 'http';
import { Transport, StatusCode } from './transport';
import * as WebSocket from 'ws';

const bs58 = require('bs58');
const DELIMITER = '$';

const ObjectId = require('bson-objectid');

export { StatusCode } from './transport';
export { PerMessageDeflateOptions } from 'ws';

enum HeartbeatMode {
    upstream = 'upstream',
    downstream = 'downstream',
    roundtrip = 'roundtrip',
    disabled = 'disabled'
}

enum State {
    open = 'open',
    closed = 'closed'
}

export interface Options {
    defaultHeartbeatMode?: HeartbeatMode;
    defaultHeartbeatInterval?: number;
    heartbeatTimeoutMultiplier?: number;
    supportedOptions?: SupportedOptions & { perMessageDeflateOptions?: WebSocket.PerMessageDeflateOptions; };
}

interface SupportedOptions {
    heartbeatModes?: Set<HeartbeatMode> | HeartbeatMode[];
    minHeartbeatInterval?: number;
    maxHeartbeatInterval?: number;
}

export interface Connection extends WebSocket {
    defaultHeartbeatInterval: number;
    heartbeatTimeoutMultiplier: number | ((client: Client) => number);
    heartbeatMode: HeartbeatMode;
    heartbeatInterval: number;
    rpcTransactions: {
        [transactionId: string]: {
            timer: any;
            callback: (response: any, error?: Error) => void;
        }
    };
    expires: NodeJS.Timer;
}

export interface StandardPacket {
    t?: 'hb' | 'hbr' | 'ns' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

enum PacketType {
    Heartbeat,
    HeartbeatRequest,
    NegotiateSettings,
    Message,
    Request,
    Response,
    Acknowledgement
}

export class Client<Context = any> extends EventEmitter {
    private _connection: Connection;

    public context: Context | undefined;
    public lastHeartbeat: Date | undefined;
    public parameters?: string[];
    public state: State | undefined;

    constructor(connection: Connection) {
        super();
        this._connection = connection;
    }

    public get connection(): Connection {
        return this._connection;
    }
    public set connection(connection: Connection) {
        this._connection = connection;
    }

    private getTimeout(): number {
        return (this._connection.heartbeatInterval || this._connection.defaultHeartbeatInterval) * (typeof this._connection.heartbeatTimeoutMultiplier === 'number' ? this._connection.heartbeatTimeoutMultiplier : this._connection.heartbeatTimeoutMultiplier(this)) * 1000;
    }

    public send(message: string, data?: any) {
        const packet: Partial<StandardPacket> = {
            m: message
        };
        if (data) {
            packet.d = data;
        }
        this._connection.send(JSON.stringify(packet));
    }

    public sendWithAck(message: string, data?: any) {
        return new Promise((resolve, reject) => {
            const packet: Partial<StandardPacket> = {
                m: message
            };
            const acknowledgementId: string = ObjectId();
            packet.i = acknowledgementId; // Only for messages with acknowledgement
            if (!this._connection.rpcTransactions) this._connection.rpcTransactions = {};
            this._connection.rpcTransactions[acknowledgementId] = {
                callback: (response: undefined, error?: Error) => {
                    clearTimeout(this._connection.rpcTransactions[acknowledgementId].timer);
                    delete this._connection.rpcTransactions[acknowledgementId];
                    error ? reject(error) : resolve();
                },
                timer: setTimeout(() => {
                    this._connection.rpcTransactions[acknowledgementId].callback(undefined, new Error('Acknowledgement timed out.'));
                }, this.getTimeout())
            };
            if (data) {
                packet.d = data;
            }
            this._connection.send(JSON.stringify(packet));
        });

    }

    public request(message: string, data: any = {}) {
        return new Promise((resolve, reject) => {
            const requestId: string = ObjectId();
            const packet: Partial<StandardPacket> = {
                m: message,
                d: data,
                r: requestId
            };

            this._connection.send(JSON.stringify(packet));

            if (!this._connection.rpcTransactions) this._connection.rpcTransactions = {};
            this._connection.rpcTransactions[requestId] = {
                callback: (response: any, error?: Error) => {
                    // Clear and delete rpc
                    clearTimeout(this._connection.rpcTransactions[requestId].timer);
                    delete this._connection.rpcTransactions[requestId];

                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                },
                timer: setTimeout(() => {
                    // Timed out in acknowledging response
                    this._connection.rpcTransactions[requestId].callback(undefined, new Error('Response timed out.'));
                }, this.getTimeout())
            };
        });
    }

    public close(code: StatusCode | number, message?: string) {
        Transport.close(this._connection, code, message);
    }
}

export class Session<Context = any> extends EventEmitter {
    private transport: Transport;
    private defaultHeartbeatMode: HeartbeatMode;
    private defaultHeartbeatInterval: number;
    private heartbeatTimeoutMultiplier: number | ((client: Client) => number);

    public supportedOptions: SupportedOptions = {
        heartbeatModes: [HeartbeatMode.roundtrip],
        minHeartbeatInterval: .1,
        maxHeartbeatInterval: 60
    };

    public clients: Client<Context>[] = [];

    constructor(server: http.Server, options?: Options) {
        super();
        this.transport = new Transport(server, options && options.supportedOptions && options.supportedOptions.perMessageDeflateOptions ? options.supportedOptions.perMessageDeflateOptions : undefined);

        // Fill in empty
        if (!options) options = {};
        if (!options.supportedOptions) options.supportedOptions = {};
        this.defaultHeartbeatMode = options.defaultHeartbeatMode ? options.defaultHeartbeatMode : HeartbeatMode.roundtrip;
        this.defaultHeartbeatInterval = options.defaultHeartbeatInterval ? options.defaultHeartbeatInterval : 1;
        this.heartbeatTimeoutMultiplier = options.heartbeatTimeoutMultiplier ? options.heartbeatTimeoutMultiplier : 2.5;
        // Optional support to override defaults
        if (options.supportedOptions.heartbeatModes) this.supportedOptions.heartbeatModes = options.supportedOptions.heartbeatModes;
        if (options.supportedOptions.minHeartbeatInterval) this.supportedOptions.minHeartbeatInterval = options.supportedOptions.minHeartbeatInterval;
        if (options.supportedOptions.maxHeartbeatInterval) this.supportedOptions.maxHeartbeatInterval = options.supportedOptions.maxHeartbeatInterval;

        this.transport.on('connection', (connection: Connection, request: http.IncomingMessage) => {
            const client = new Client(connection);
            this.clients.push(client);
            // Set up connection expiration and start timeout
            this.onConnectionActive(client);
            // Set up authentication info

            if (request.headers[`sec-websocket-protocol`] && typeof request.headers[`sec-websocket-protocol`] === 'string') {
                client.parameters = this.decodeParameters(request.headers[`sec-websocket-protocol`] as string);
            }

            this.emit('connected', client);
            client.emit('connected');
            client.state = State.open;
            client.connection.defaultHeartbeatInterval = this.defaultHeartbeatInterval;

        });

        this.transport.on('close', (connection: Connection, code: number, message: string) => {
            const client = this.getClient(connection);
            if (client) {
                this.onConnectionInactive(client);
            }
        });

        this.transport.on('message', (connection: Connection, data) => {
            const client = this.getClient(connection);
            if (client) this.onMessage(client, data);
        });
    }

    private decodeParameters(encodedParameters: string) {
        return Buffer.from(bs58.decode(encodedParameters)).toString('utf8').split(DELIMITER);
    }

    private getClient(connection: Connection) {
        const index = this.clients.map((client) => client.connection).indexOf(connection);
        if (index > -1) {
            return this.clients[index];
        } else {
            return undefined;
        }
    }

    private getClientTimeout(client: Client) {
        return (client.connection.heartbeatInterval || this.defaultHeartbeatInterval) * (typeof this.heartbeatTimeoutMultiplier === 'number' ? this.heartbeatTimeoutMultiplier : this.heartbeatTimeoutMultiplier(client)) * 1000;
    }

    private onConnectionActive(client: Client) {
        if (client.connection.expires) {
            try {
                client.connection.expires.refresh();
            } catch (error) {
                // Node 10.2.0 is required so fallback to the old method
                clearTimeout(client.connection.expires);
                client.connection.expires = setTimeout(() => {
                    this.onConnectionInactive(client);
                }, this.getClientTimeout(client));
            }
        } else {
            // Initial setup for timeout
            client.connection.expires = setTimeout(() => {
                this.onConnectionInactive(client);
            }, this.getClientTimeout(client));
        }
    }

    private onConnectionInactive(client: Client, code?: StatusCode, reason?: string) {
        if (client.connection.expires) clearTimeout(client.connection.expires);
        const index = this.clients.indexOf(client);
        client.connection.close(code, reason);
        client.state = State.closed;
        this.emit('disconnected', client);
        client.emit('disconnected');

        if (index > -1) this.clients.splice(index, 1);
    }

    private onMessage(client: Client, message: any) {
        this.onConnectionActive(client);

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
                this.handleHeartbeat(client, packet);
                break;
            case PacketType.HeartbeatRequest:
                this.handleHeartbeatRequest(client, packet);
                break;
            case PacketType.NegotiateSettings:
                this.handleNegotiateSettings(client, packet);
                break;
            case PacketType.Message:
                this.handleMessage(client, packet);
                break;
            case PacketType.Request:
                this.handleRequest(client, packet);
                break;
            case PacketType.Response:
                this.handleResponse(client, packet);
                break;
            case PacketType.Acknowledgement:
                this.handleAcknowledgement(client, packet);
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
                case 'ns': // Client sends its connection settings
                    return PacketType.NegotiateSettings;
                default: // Client acknowledges a response from the server
                    return PacketType.Acknowledgement;
            }
        } else { // Handle simple messages from the client
            return PacketType.Message; // Simple message from the client
        }
    }

    private handleHeartbeat(client: Client, packet: Partial<StandardPacket>) {
        this.emit('heartbeat', client);
        client.emit('heartbeat');
    }

    private handleHeartbeatRequest(client: Client, packet: Partial<StandardPacket>) {
        if (client.connection.heartbeatMode ? client.connection.heartbeatMode : this.defaultHeartbeatMode) {
            this.transport.send(client.connection, JSON.stringify({ t: 'hb' }));
        }
    }

    private handleNegotiateSettings(client: Client, packet: Partial<StandardPacket>) {
        const settings: { heartbeatMode?: HeartbeatMode, heartbeatInterval?: number, id: string } = packet.d;
        const callback = (approve: boolean, supportedOptions: SupportedOptions) => {
            if (approve) { // Change settings for new clients
                if (settings.heartbeatInterval) {
                    client.connection.heartbeatInterval = settings.heartbeatInterval;
                    // Recalculate connection timeout
                    clearTimeout(client.connection.expires);
                    delete client.connection.expires;
                    this.onConnectionActive(client);
                }
                if (settings.heartbeatMode) client.connection.heartbeatMode = settings.heartbeatMode;
            }

            this.transport.send(client.connection, JSON.stringify({ t: 'ns', d: { approve, supportedOptions, id: settings.id } } as StandardPacket));
        };
        this.emit('negotiate', client, settings, callback);
        client.emit('negotiate', settings, callback);
    }

    private handleMessage(client: Client, packet: Partial<StandardPacket>) {
        this.emit('message', client, `#${packet.m}`, packet.d);
        client.emit(`#${packet.m}`, packet.d);

        if (packet.i) { // Client expects acknowledgement
            this.transport.send(client.connection, JSON.stringify({ t: packet.i }));
        }
    }

    // Handle request expecting a response
    private handleRequest(client: Client, packet: Partial<StandardPacket>) {
        const callback = (data: any, ack?: boolean) => {
            const response: Partial<StandardPacket> = {
                m: packet.m,
                d: data,
                r: packet.r
            };
            if (ack) {
                return new Promise((resolve, reject) => {
                    const acknowledgementId: string = ObjectId();
                    response.t = acknowledgementId;
                    if (!client.connection.rpcTransactions) client.connection.rpcTransactions = {};
                    client.connection.rpcTransactions[acknowledgementId] = {
                        callback: (response: undefined, error?: Error) => {
                            clearTimeout(client.connection.rpcTransactions[acknowledgementId].timer);
                            delete client.connection.rpcTransactions[acknowledgementId];
                            error ? reject(error) : resolve();
                        },
                        timer: setTimeout(() => {
                            client.connection.rpcTransactions[acknowledgementId].callback(undefined, new Error('Acknowledgement timed out.'));
                        }, this.getClientTimeout(client))
                    };
                    this.transport.send(client.connection, JSON.stringify(response));
                });
            } else {
                this.transport.send(client.connection, JSON.stringify(response));
                return;
            }
        };
        this.emit('request', client, `@${packet.m}`, packet.d, callback);
        client.emit(`@${packet.m}`, packet.d, callback);
    }

    private handleResponse(client: Client, packet: Partial<StandardPacket>) {
        if (typeof packet.r !== 'string') return;
        if (!client.connection.rpcTransactions) client.connection.rpcTransactions = {};
        if (client.connection.rpcTransactions[packet.r]) {
            if (packet.t) { // Client expects acknowledgement of response
                this.transport.send(client.connection, JSON.stringify({ t: packet.t }));
            }
            client.connection.rpcTransactions[packet.r].callback(packet.d);
        }
    }

    private handleAcknowledgement(client: Client, packet: Partial<StandardPacket>) {
        if (typeof packet.t !== 'string') return;
        if (!client.connection.rpcTransactions) client.connection.rpcTransactions = {};
        if (client.connection.rpcTransactions[packet.t]) {
            client.connection.rpcTransactions[packet.t].callback(undefined);
        }
    }

    public send(client: Client, message: string, data?: any) {
        const packet: Partial<StandardPacket> = {
            m: message
        };
        if (data) {
            packet.d = data;
        }
        this.transport.send(client.connection, JSON.stringify(packet));
    }

    public sendWithAck(client: Client, message: string, data?: any) {
        return new Promise((resolve, reject) => {
            const packet: Partial<StandardPacket> = {
                m: message,

            };
            const acknowledgementId: string = ObjectId();
            packet.i = acknowledgementId; // Only for messages with acknowledgement
            if (!client.connection.rpcTransactions) client.connection.rpcTransactions = {};
            client.connection.rpcTransactions[acknowledgementId] = {
                callback: (response: undefined, error?: Error) => {
                    clearTimeout(client.connection.rpcTransactions[acknowledgementId].timer);
                    delete client.connection.rpcTransactions[acknowledgementId];
                    error ? reject(error) : resolve();
                },
                timer: setTimeout(() => {
                    client.connection.rpcTransactions[acknowledgementId].callback(undefined, new Error('Acknowledgement timed out.'));
                }, this.getClientTimeout(client))
            };
            if (data) {
                packet.d = data;
            }
            this.transport.send(client.connection, JSON.stringify(packet));
        });

    }

    public request<T = any>(client: Client, message: string, data: any = {}) {
        return new Promise<T>((resolve, reject) => {
            const requestId: string = ObjectId();
            const packet: Partial<StandardPacket> = {
                m: message,
                d: data,
                // r: message,
                r: requestId
            };

            this.transport.send(client.connection, JSON.stringify(packet));

            if (!client.connection.rpcTransactions) client.connection.rpcTransactions = {};
            client.connection.rpcTransactions[requestId] = {
                callback: (response: any, error?: Error) => {
                    // Clear and delete rpc
                    clearTimeout(client.connection.rpcTransactions[requestId].timer);
                    delete client.connection.rpcTransactions[requestId];

                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                },
                timer: setTimeout(() => {
                    // Timed out in acknowledging response
                    client.connection.rpcTransactions[requestId].callback(undefined, new Error('Response timed out.'));
                }, this.getClientTimeout(client))
            };

        });
    }

    public close(client: Client, code: StatusCode | number, message?: string) {
        Transport.close(client.connection, code, message);
    }

}