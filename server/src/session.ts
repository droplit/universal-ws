import { EventEmitter } from 'events';
import * as http from 'http';
import { Transport, StatusCode } from './transport';
import * as WebSocket from 'ws';

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
    supportedOptions?: {
        heartbeatModes?: Set<HeartbeatMode> | HeartbeatMode[];
        minHeartbeatInterval?: number;
        maxHeartbeatInterval?: number;
        perMessageDeflateOptions?: WebSocket.PerMessageDeflateOptions;
    };
}

export interface Connection extends WebSocket {
    heartbeatModes: Set<HeartbeatMode>;
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
    t?: 'hb' | 'hbr' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

enum PacketType {
    Heartbeat,
    HeartbeatRequest,
    ConnectionSettings,
    Message,
    Request,
    Response,
    Acknowledgement
}

class Client<Context = any> extends EventEmitter {
    private _connection: Connection;

    public context: Context | undefined;
    public heartbeatMode: HeartbeatMode | undefined;
    public heartbeatInterval: number | undefined;
    public lastHeartbeat: Date | undefined;
    public username: string | undefined;
    public password: string | undefined;
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
}

export class Session<Context = any> extends EventEmitter {
    private transport: Transport;
    private defaultHeartbeatMode: HeartbeatMode;
    private defaultHeartbeatInterval: number;
    private heartbeatTimeoutMultiplier: number | ((client: Client) => number);
    private supportedHeartbeatModes: HeartbeatMode[] | Set<HeartbeatMode>;
    private minHeartbeatInterval: number;
    private maxHeartbeatInterval: number;

    public clients: Client<Context>[] = [];

    constructor(server: http.Server, options?: Options) {
        super();
        this.transport = new Transport(server, options && options.supportedOptions && options.supportedOptions.perMessageDeflateOptions ? options.supportedOptions.perMessageDeflateOptions : undefined);

        // Fill in empty
        if (!options) options = {};
        if (!options.supportedOptions) options.supportedOptions = {};
        this.defaultHeartbeatMode = options.defaultHeartbeatMode ? options.defaultHeartbeatMode : HeartbeatMode.roundtrip;
        this.defaultHeartbeatInterval = options.defaultHeartbeatInterval ? options.defaultHeartbeatInterval : 1;
        this.supportedHeartbeatModes = options.supportedOptions.heartbeatModes ? options.supportedOptions.heartbeatModes : [HeartbeatMode.roundtrip];
        this.heartbeatTimeoutMultiplier = options.heartbeatTimeoutMultiplier ? options.heartbeatTimeoutMultiplier : 2.5;
        this.minHeartbeatInterval = options.supportedOptions.minHeartbeatInterval ? options.supportedOptions.minHeartbeatInterval : .1;
        this.maxHeartbeatInterval = options.supportedOptions.maxHeartbeatInterval ? options.supportedOptions.maxHeartbeatInterval : 60;

        this.transport.on('connection', (connection: Connection, request: http.IncomingMessage) => {
            const client = new Client(connection);
            this.clients.push(client);
            // Set up connection expiration and start timeout
            this.onConnectionActive(client);
            // Set up authentication info
            if (request.headers.authorization) {
                if (request.headers.authorization.startsWith('Basic ')) {
                    const decodedAuth = Buffer.from(request.headers.authorization.replace('Basic ', ''), 'base64').toString();
                    const [username, password] = decodedAuth.split(':');
                    client.username = username;
                    client.password = password;
                } else {
                    console.log('UNEXPECTED AUTH HEADER:', request.headers.authorization);
                }
            }

            this.emit('connected', client);
        });

        this.transport.on('close', (connection: Connection, code: number, message: string) => {
            const client = this.getClient(connection);
            if (client) {
                this.emit('close', client, code, message);
                this.onConnectionInactive(client);
            }
        });

        this.transport.on('message', (connection: Connection, data) => {
            const client = this.getClient(connection);
            if (client) this.onMessage(client, data);
        });
    }

    private getClient(connection: Connection) {
        const index = this.clients.map(client => client.connection).indexOf(connection);
        if (index > -1) {
            return this.clients[index]
        } else {
            return undefined;
        }
    }

    private onConnectionActive(client: Client) {
        if (client.connection.expires) {
            client.connection.expires.refresh();
        } else {
            // Initial setup for timeout
            client.connection.expires = setTimeout(() => {
                this.onConnectionInactive(client);
            }, (client.connection.heartbeatInterval || this.defaultHeartbeatInterval) * (typeof this.heartbeatTimeoutMultiplier === 'number' ? this.heartbeatTimeoutMultiplier : this.heartbeatTimeoutMultiplier(client)) * 1000);
        }
    }

    private onConnectionInactive(client: Client, code?: StatusCode, reason?: string) {
        if (client.connection.expires) clearTimeout(client.connection.expires);
        const index = this.clients.indexOf(client);
        client.connection.close(code, reason);
        this.emit('disconnected', client);

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
            case PacketType.ConnectionSettings:
                this.handleConnectionSettings(client, packet);
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
                case 'cs': // Client sends its connection settings
                    return PacketType.ConnectionSettings;
                default: // Client acknowledges a response from the server
                    return PacketType.Acknowledgement;
            }
        } else { // Handle simple messages from the client
            return PacketType.Message; // Simple message from the client
        }
    }

    private handleHeartbeat(client: Client, packet: Partial<StandardPacket>) {
        this.emit('heartbeat', client);
    }

    private handleHeartbeatRequest(client: Client, packet: Partial<StandardPacket>) {
        if (client.heartbeatMode ? client.heartbeatMode : this.defaultHeartbeatMode) {
            this.transport.send(client.connection, JSON.stringify({ t: 'hb' }));
        }
    }

    private handleMessage(connection: Context<T>, packet: Partial<StandardPacket>) {
        this.emit(`@${packet.m}`, connection, packet.d, connection.context);
    }

    // Handle request expecting a response
    private handleRequest(connection: Context<T>, packet: Partial<StandardPacket>) {
        this.emit(`#${packet.m}`, connection, packet.d, connection.context, (result: any, onAcknowledge?: (response: any, error?: Error) => void, aknowledgementTimeout: number = 5000) => {
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
                    callback: (response: any, error?: Error) => {
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
                        connection.rpcTransactions[acknowledgementId].callback(undefined, new Error('Acknowledgement timed out'));
                    }, aknowledgementTimeout)
                };
            } else {
                return Promise.resolve();
            }

            this.transport.send(connection, JSON.stringify(response));
            // connection.send(JSON.stringify(response));
        });
    }

    private handleResponse(connection: Context<T>, packet: Partial<StandardPacket>) {
        if (typeof packet.r !== 'string') return;
        if (connection.rpcTransactions[packet.r]) {
            if (packet.t) { // Client expects acknowledgement of response
                this.transport.send(connection, JSON.stringify({ t: packet.t }));
                // connection.send(JSON.stringify({ t: packet.t }));
            }
            connection.rpcTransactions[packet.r].callback(packet.d);
        }
    }

    private handleAcknowledgement(connection: Context<T>, packet: Partial<StandardPacket>) {
        if (typeof packet.t !== 'string') return;
        if (connection.rpcTransactions[packet.t]) {
            connection.rpcTransactions[packet.t].callback(undefined);
        }
    }

    public sendMessage(connection: Context<T>, message: string, data?: any) {
        const packet: Partial<StandardPacket> = {
            m: message
        };
        if (data) {
            packet.d = data;
        }
        this.transport.send(connection, JSON.stringify(packet));
    }

    public makeRequest(connection: Context<T>, message: string, data: any = {}, callback: (response: any, error?: Error) => void) {
        const requestId: string = ObjectId();
        const packet: Partial<StandardPacket> = {
            m: message,
            d: data,
            // r: message,
            r: requestId
        };

        this.transport.send(connection, JSON.stringify(packet));

        if (!connection.rpcTransactions) connection.rpcTransactions = {};
        connection.rpcTransactions[requestId] = {
            callback: (response: any, error?: Error) => {
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
                connection.rpcTransactions[requestId].callback(undefined, new Error('No response from client connection. Request timed out'));
            }, connection.timeout)
        };
    }

    public close(connection: Context<T>, code: StatusCode, message?: string) {
        this.transport.close(connection, code, message);
    }

}