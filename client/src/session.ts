import { EventEmitter } from 'events';
import * as retry from 'retry';
import { UniversalWs as Transport, StatusCode } from './transport';
import { PerMessageDeflateOptions } from 'ws';

export { StatusCode } from './transport';

export interface StandardPacket {
    t?: 'hb' | 'hbr' | 'ns' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

enum PacketType {
    Heartbeat,
    Message,
    Request,
    Response,
    Acknowledgement,
    NegotiateSettings
}

enum HeartbeatMode {
    upstream = 'upstream',
    downstream = 'downstream',
    roundtrip = 'roundtrip',
    disabled = 'disabled'
}

enum State {
    connecting,
    open,
    closing,
    closed
}

interface ConnectionOptions {
    connectionTimeout?: number;
    responseTimeout?: number;
    username?: string;
    password?: string;
    heatbeatInterval?: number;
    heartbeatMode?: HeartbeatMode;
    heartbeatModeTimeoutMultiplier?: number | (() => number);
    autoConnect?: boolean;
    perMessageDeflateOptions?: PerMessageDeflateOptions;
    retryOptions?: retry.OperationOptions;
}

export class Session extends EventEmitter {
    private host: string;
    private transport?: Transport;
    private expires: any;
    private waiting: (() => void)[] = [];
    private rpcTransactions: {
        [transactionId: string]: {
            timer: any;
            callback: (response: any, error?: any) => void;
        }
    } = {};
    private connectionTimeout = 60;
    private responseTimeout = 15;
    private username: string;
    private password: string;
    private heatbeatInterval = 1;
    private heartbeatMode: HeartbeatMode = HeartbeatMode.roundtrip;
    private heartbeatModeTimeoutMultiplier: number | (() => number) = 2.5;
    private autoConnect = true;
    private perMessageDeflateOptions: PerMessageDeflateOptions;
    private retryOptions: retry.OperationOptions;
    private connectOperation: retry.OperationOptions;

    constructor(uri: string, options?: ConnectionOptions) {
        super();

        this.host = uri;

        if (!options) options = {}; // Fill if empty
        if (options.connectionTimeout) this.connectionTimeout = options.connectionTimeout;
        if (options.responseTimeout) this.responseTimeout = options.responseTimeout;
        if (options.username) this.username = options.username;
        if (options.password) this.password = options.password;
        if (options.heatbeatInterval) this.heatbeatInterval = options.heatbeatInterval;
        if (options.heartbeatMode) this.heartbeatMode = options.heartbeatMode;
        if (options.heartbeatModeTimeoutMultiplier) this.heartbeatModeTimeoutMultiplier = options.heartbeatModeTimeoutMultiplier;
        if (options.autoConnect) this.autoConnect = options.autoConnect;
        if (options.perMessageDeflateOptions) this.perMessageDeflateOptions = options.perMessageDeflateOptions;
        this.retryOptions =  options.retryOptions ? options.retryOptions : {
            
        }

        this.connectOperation = retry.operation(this.retryOptions || {

        });

        this.retryConnect();
    }

    private retryConnect() {
        this.connectOperation.attempt((currentAttempt: number) => {
            this.restart((connected: boolean, error?: any) => {
                if (this.connectOperation.retry(error)) {
                    return;
                }
            });
        });
    }

    private async restart(onConnected?: (connected: boolean) => void) {
        try {
            this.transport = new Transport();
            await this.transport.constructTransport(this.host);
            this.transport.on('open', (data: any) => {
                this.handleOpen(data, onConnected);
            });
            this.transport.on('message', (data: any) => {
                this.handleMessage(data);
            });
            this.transport.on('close', (data: { code: StatusCode, reason: string }) => {
                this.handleClose(data);
            });
            this.transport.on('error', (data: any) => {
                this.handleError(data);
            });
        } catch (error) {
            // Throw error connecting?
            throw new Error(`Could not connect to host: ${error}`);
        }
    }

    private connectionReady() {
        this.emit('connected'); // Connected and ready
        if (this.waiting) {
            this.waiting.forEach((callback) => {
                process.nextTick(callback);
            });
            delete this.waiting;
        }

        this.startHeartbeat();
    }

    private startHeartbeat() {
        this.resetTimeout();
        this.polls = setInterval(() => {
            // Request a heartbeat from the server
            this.requestHeartbeat();
        }, this.pollRate);

    }

    private stopHeartbeat() {
        clearTimeout(this.expires);
        clearInterval(this.polls);
    }

    private awaitReady(callback: () => void) {
        if (this.isOpen) {
            process.nextTick(callback);
        } else {
            this.waiting = this.waiting || [];
            this.waiting.push(callback);
        }
    }

    private resetTimeout() {
        // Clear previous if it exists
        if (this.expires) clearTimeout(this.expires);

        this.expires = setTimeout(() => {
            // Server has not responded to heartbeat, close connection
            this.close(1000, 'No response to heartbeat');
        }, this.timeout); // TODO: CHANGE TO NEGEOTIATED VALUE
    }

    private getPacketType(packet: StandardPacket) {
        if (packet.r) { // Handle request/response control
            if (typeof packet.r === 'string') { // Random string indicates a request from the server
                return PacketType.Request;
            } else if (typeof packet.r === 'number') { // Incrementing number indicates a response from the server
                return PacketType.Response;
            } else {
                return; // Invalid packet
            }
        } else if (packet.t) { // Handle Heartbeat & Acknowledgement
            switch (packet.t) {
                case 'hb': // Server responds to client's heartbeat request
                    return PacketType.Heartbeat;
                default: // Server acknowledges a response from the client
                    return PacketType.Acknowledgement;
            }
        } else { // Handle simple messages from the client
            return PacketType.Message; // Simple message from the client
        }
    }

    private handleOpen(data: any, onConnected?: (connected: boolean) => void) {
        this.emit('connection', data); // Connected but not yet ready
        this.isOpen = true;
        this.connectionReady();
        if (onConnected) onConnected(true);

    }

    private handleClose(data: { code: StatusCode, reason: string }) {
        this.transport = undefined; // OR delete this.transport;?
        if (this.isOpen) {
            this.isOpen = false;
            this.stopHeartbeat();
            Object.keys(this.rpcTransactions).forEach((transactionId) => {
                this.rpcTransactions[transactionId].callback(undefined, 'Connection closed');
            });
            this.emit('close', data.code, data.reason);
            switch (data.code) {
                case 1008:
                    // Do not reconnect, failed to authenticate
                    break;
                default:
                    this.retryConnect(); // If close was not expected or on client terms, retry connecting
                    break;
            }
        }
    }

    private handleError(data: any) {
        this.emit('error', data);
        this.isOpen = false;
        this.stopHeartbeat();
        this.retryConnect();
    }

    private handleMessage(message: string) {
        this.onConnectionActive();

        if (!message) return;

        this.awaitReady(() => {
            let packet: StandardPacket;

            // parse packet JSON
            try {
                packet = JSON.parse(message);
            } catch (error) {
                // throw?
                throw new Error('Invalid packet');
            }

            switch (this.getPacketType(packet)) {
                case PacketType.Heartbeat: // Heartbeat handled by onConnectionActive
                    break;
                case PacketType.Message: // Message from the server
                    this.onMessage(packet);
                    break;
                case PacketType.Request: // Request from the server expecting a response from client
                    this.onRequest(packet);
                    break;
                case PacketType.Response: // Response from the server for a previous request
                    this.onResponse(packet);
                    break;
                case PacketType.Acknowledgement: // Acknowledgement from server of a response from client
                    this.onAcknowledgement(packet);
                    break;
                default:
                    throw new Error('Invalid packet');
            }
        });
    }

    private onConnectionActive() {
        if (this.isOpen) {
            this.resetTimeout();
        }
    }

    private onMessage(packet: Partial<StandardPacket>) {
        this.emit(`@${packet.m}`, packet.d);
    }

    private onRequest(packet: Partial<StandardPacket>) {
        // Handle request expecting a response
        this.emit(`#${packet.m}`, packet.d, (result: any, onAcknowledge?: (response: any, error?: any) => void, acknowledgementTimeout: number = 5000) => {
            const response: Partial<StandardPacket> = {
                m: JSON.stringify(packet.m),
                d: result,
                r: JSON.stringify(packet.i)
            };
            if (onAcknowledge) {
                const acknowledgementId = this.getNextMessageId().toString();
                response.t = acknowledgementId;

                this.rpcTransactions[acknowledgementId] = {
                    callback: (response: any, error?: any) => {
                        // Clear and delete rpc
                        clearTimeout(this.rpcTransactions[acknowledgementId].timer);
                        delete this.rpcTransactions[acknowledgementId];
                        if (error) {
                            onAcknowledge(undefined, error);
                        } else {
                            onAcknowledge(response);
                        }
                    },
                    timer: setTimeout(() => {
                        // Timed out in acknowledging response
                        this.rpcTransactions[acknowledgementId].callback(undefined, 'Acknowledgement timed out');
                    }, acknowledgementTimeout)
                };
            } else {
                return Promise.resolve();
            }
            if (this.transport) this.transport.send(JSON.stringify(response));
        });
    }

    private onResponse(packet: Partial<StandardPacket>) {
        if (typeof packet.r !== 'number') return;
        if (this.rpcTransactions[packet.r]) {
            if (packet.t) { // Client expects acknowledgement of response
                if (this.transport) this.transport.send(JSON.stringify({ t: packet.t }));
            }
            this.rpcTransactions[packet.r].callback(packet.d);
        }
    }

    private onAcknowledgement(packet: Partial<StandardPacket>) {
        if (typeof packet.t !== 'string') return;
        if (this.rpcTransactions[packet.t]) {
            this.rpcTransactions[packet.t].callback(undefined);
        }
    }

    private requestHeartbeat() {
        if (this.transport) this.transport.send(JSON.stringify({ t: 'hbr' }));
    }

    private messageIdSeed = 0;

    private getNextMessageId() {
        if (this.messageIdSeed === Number.MAX_SAFE_INTEGER) this.messageIdSeed = 0; // Reset to 0
        return ++this.messageIdSeed;
    }

    public sendMessage(message: string, data?: any) {
        const packet: Partial<StandardPacket> = {
            m: message
        };
        if (data) {
            packet.d = data;
        }
        this.awaitReady(() => {
            if (this.transport) this.transport.send(JSON.stringify(packet));
        });
    }

    public makeRequest(message: string, data: any = {}, callback: (response: any, error?: any) => void) {
        const requestId = this.getNextMessageId();
        const packet = {
            m: message,
            d: data,
            // r: message,
            r: requestId
        };

        this.awaitReady(() => {
            if (this.transport) this.transport.send(JSON.stringify(packet));

            this.rpcTransactions[requestId] = {
                callback: (response: any, error: any) => {
                    // Clear and delete rpc
                    clearTimeout(this.rpcTransactions[requestId].timer);
                    delete this.rpcTransactions[requestId];
                    if (error) {
                        callback(undefined, error);
                    } else {
                        callback(response);
                    }
                },
                timer: setTimeout(() => {
                    // Timed out in acknowledging response
                    this.rpcTransactions[requestId].callback(undefined, 'No response from client connection. Request timed out');
                }, this.timeout)
            };

        });
    }

    public close(code?: StatusCode, reason?: string) {
        if (this.transport) this.transport.close(code, reason);

        // Clean up events
        this.isOpen = false;
        this.stopHeartbeat();
        Object.keys(this.rpcTransactions).forEach((transactionId) => {
            this.rpcTransactions[transactionId].callback(undefined, 'Connection closed');
        });
    }

}