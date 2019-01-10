import { EventEmitter } from 'events';
import * as retry from 'retry';
import { UniversalWs as Transport, StatusCode } from './transport';
import { PerMessageDeflateOptions } from 'ws';

const HOST_REGEX = /^(wss|ws):\/\/(.+)$/;

export { StatusCode } from './transport';

export interface StandardPacket {
    t?: 'hb' | 'hbr' | 'ns' | string;
    m: string;
    d: any;
    r?: boolean | string;
    i: string;
}

export interface SupportedOptions {
    heartbeatModes?: Set<HeartbeatMode> | HeartbeatMode[];
    minHeartbeatInterval?: number;
    maxHeartbeatInterval?: number;
}

enum PacketType {
    Heartbeat,
    Message,
    Request,
    Response,
    Acknowledgement,
    NegotiateSettings
}

export enum HeartbeatMode {
    upstream = 'upstream',
    downstream = 'downstream',
    roundtrip = 'roundtrip',
    disabled = 'disabled'
}

export enum State {
    connecting,
    open,
    closing,
    closed
}

export interface ConnectionOptions {
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
    private heartbeatPolling!: NodeJS.Timer;
    private expires?: NodeJS.Timer;
    private waiting: (() => void)[] = [];
    private rpcTransactions: {
        [transactionId: string]: {
            timer: any;
            callback: (response: any, error?: any) => void;
        }
    } = {};
    private connectionTimeout = 60;
    public responseTimeout = 15;
    private username?: string;
    private password?: string;
    private heartbeatModeTimeoutMultiplier: number | (() => number) = 2.5;
    private autoConnect = true;
    private perMessageDeflateOptions?: PerMessageDeflateOptions;
    private retryOptions: retry.OperationOptions;
    private connectOperation: retry.RetryOperation;

    public heatbeatInterval = 1;
    public heartbeatMode: HeartbeatMode = HeartbeatMode.roundtrip;
    public state: State = State.closed;

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
        this.retryOptions = options.retryOptions ? options.retryOptions : {
            factor: 1.5,
            minTimeout: .5 * 1000,
            maxTimeout: 60 * 1000,
            randomize: true,
            forever: true
        };

        this.connectOperation = retry.operation(this.retryOptions);

        this.retryConnect();
    }

    private changeState(state: State) {
        this.state = state;
        this.emit('state', state);
    }

    private retryConnect() {
        this.changeState(State.connecting);
        this.connectOperation.attempt((currentAttempt: number) => {
            this.restart();
        });
    }

    private restart() {
        try {
            if (this.username) {
                const hostMatch = this.host.match(HOST_REGEX);
                if (hostMatch) {
                    setTimeout(() => {
                        if (this.transport) {
                            if (this.password) {
                                this.transport = new Transport(`${hostMatch[1]}://${this.username}:${this.password}@${hostMatch[2]}`, this.perMessageDeflateOptions);
                            } else {
                                this.transport = new Transport(`${hostMatch[1]}://${this.username}@${hostMatch[2]}`, this.perMessageDeflateOptions);
                            }
                        }
                    }, this.connectionTimeout * 1000);
                } else {
                    throw new Error(`Invalid host: ${this.host}`);
                }
            } else {
                setTimeout(() => {
                    this.transport = new Transport(this.host, this.perMessageDeflateOptions);
                }, this.connectionTimeout * 1000);
            }
            console.log('TRANSPORT EXISTS:', !!this.transport);
            if (this.transport) {
                this.transport.on('open', (data: any) => {
                    console.log('CONNECTION OPEN:', data);
                    this.connectionReady();
                });
                this.transport.on('message', (data: any) => {
                    console.log('RECEIVED DATA:', data);
                    this.handleMessage(data);
                });
                this.transport.on('close', (data: { code: StatusCode, reason: string }) => {
                    this.handleClose(data);
                });
                this.transport.on('error', (data: any) => {
                    this.handleError(data);
                });
            }
        } catch (error) {
            // Throw error connecting?
            throw new Error(`Could not connect to host: ${error}`);
        }
    }

    private connectionReady() {
        this.changeState(State.open);
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
        if (this.heartbeatMode === HeartbeatMode.disabled || this.heartbeatMode === HeartbeatMode.downstream) return;

        // Clear previous heartbeatPolling if restarting
        if (this.heartbeatPolling) clearInterval(this.heartbeatPolling);
        this.heartbeatPolling = setInterval(() => {
            this.heartbeatMode === HeartbeatMode.upstream ? this.sendHeartbeat() : this.requestHeartbeat();
        }, this.heatbeatInterval * 1000);

        this.resetTimeout();
    }

    private stopHeartbeat() {
        if (this.expires) clearTimeout(this.expires);
        if (this.heartbeatPolling) clearInterval(this.heartbeatPolling);
    }

    private awaitReady(callback: () => void) {
        if (this.state === State.open) {
            process.nextTick(callback);
        } else {
            this.waiting = this.waiting || [];
            this.waiting.push(callback);
        }
    }

    private resetTimeout() {
        if (this.expires) {
            this.expires.refresh();
        } else {
            this.expires = setTimeout(() => {
                this.onConnectionActive();
            }, this.heatbeatInterval * (typeof this.heartbeatModeTimeoutMultiplier === 'number' ? this.heartbeatModeTimeoutMultiplier : this.heartbeatModeTimeoutMultiplier()) * 1000);
        }
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
                case 'ns': // Server responds to client's negotiate settings
                    return PacketType.NegotiateSettings;
                default: // Server acknowledges a response from the client
                    return PacketType.Acknowledgement;
            }
        } else { // Handle simple messages from the client
            return PacketType.Message; // Simple message from the client
        }
    }

    private handleClose(data: { code: StatusCode, reason: string }) {
        this.transport = undefined; // or delete Transport?
        if (this.state === State.open) {
            this.changeState(State.closing);
            this.stopHeartbeat();
            Object.keys(this.rpcTransactions).forEach((transactionId) => {
                this.rpcTransactions[transactionId].callback(undefined, 'Connection closed');
            });
            this.emit('disconnected', data.code, data.reason);
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
        this.onConnectionInactive();
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

            console.log('HANDLING PACKET:', packet);

            switch (this.getPacketType(packet)) {
                case PacketType.Heartbeat: // Heartbeat handled by onConnectionActive
                    break;
                case PacketType.NegotiateSettings:
                    this.onNegotiateSettings(packet);
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
        if (this.state === State.open) {
            this.resetTimeout();
        }
    }

    private onConnectionInactive(data?: { code: StatusCode, reason: string }) {
        this.changeState(State.closing);
        this.stopHeartbeat();
        data ? this.emit('disconnected', data.code, data.reason) : this.emit('disconnected');
        if (this.autoConnect) {
            this.retryConnect();
        }
    }

    private onNegotiateSettings(packet: Partial<StandardPacket>) {
        // Handle negotiate expecting approval response
        if (this.rpcTransactions[packet.d.id]) {
            if (packet.t) { // Client expects acknowledgement of response
                if (this.transport) this.transport.send(JSON.stringify({ t: packet.t }));
            }
            this.rpcTransactions[packet.d.id].callback(packet.d);
        }
    }

    private onMessage(packet: Partial<StandardPacket>) {
        this.emit(`#${packet.m}`, packet.d);
    }

    private onRequest(packet: Partial<StandardPacket>) {
        // Handle request expecting a response
        const callback = (data: any, ack?: boolean) => {
            const response: Partial<StandardPacket> = {
                m: JSON.stringify(packet.m),
                d: data,
                r: JSON.stringify(packet.i)
            };
            if (ack) {
                return new Promise((resolve, reject) => {
                    const acknowledgementId = this.getNextMessageId().toString();
                    response.t = acknowledgementId;

                    this.rpcTransactions[acknowledgementId] = {
                        callback: (response: any, error?: any) => {
                            // Clear and delete rpc
                            clearTimeout(this.rpcTransactions[acknowledgementId].timer);
                            delete this.rpcTransactions[acknowledgementId];
                            error ? reject(error) : resolve();
                        },
                        timer: setTimeout(() => {
                            // Timed out in acknowledging response
                            this.rpcTransactions[acknowledgementId].callback(undefined, 'Acknowledgement timed out');
                        }, this.responseTimeout)
                    };
                    if (this.transport) this.transport.send(JSON.stringify(response));
                });
            } else {
                if (this.transport) this.transport.send(JSON.stringify(response));
                return;
            }
        };

        this.emit(`@${packet.m}`, packet.d, callback);
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

    private sendHeartbeat() {
        if (this.transport) this.transport.send(JSON.stringify({ t: 'hb' }));
    }

    private requestHeartbeat() {
        if (this.transport) this.transport.send(JSON.stringify({ t: 'hbr' }));
    }

    private messageIdSeed = 0;

    private getNextMessageId() {
        if (this.messageIdSeed === Number.MAX_SAFE_INTEGER) this.messageIdSeed = 0; // Reset to 0
        return ++this.messageIdSeed;
    }

    public negotiate(settings: { heartbeatMode?: HeartbeatMode, heartbeatInterval?: number }) {
        return new Promise<{ approve: boolean, supportedOptions?: SupportedOptions }>((resolve, reject) => {
            const packet: Partial<StandardPacket> = {
                t: 'ns',
                d: settings
            };
            this.awaitReady(() => {
                const negotiationId: string = this.getNextMessageId().toString();
                this.rpcTransactions[negotiationId] = {
                    callback: (response: { approve: boolean, supportedOptions?: SupportedOptions }, error: Error) => {
                        // Clear and delete rpc
                        clearTimeout(this.rpcTransactions[negotiationId].timer);
                        delete this.rpcTransactions[negotiationId];
                        error ? reject(error) : resolve({ approve: response.approve, supportedOptions: response.supportedOptions });
                    },
                    timer: setTimeout(() => {
                        this.rpcTransactions[negotiationId].callback(undefined, new Error('Negotiation timed out.'));
                    }, this.responseTimeout)
                };
                if (this.transport) this.transport.send(JSON.stringify(packet));
            });

        });
    }

    public send(message: string, data?: any) {
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

    public sendWithAck(message: string, data?: any) {
        return new Promise((resolve, reject) => {
            const packet: Partial<StandardPacket> = {
                m: message
            };
            if (data) {
                packet.d = data;
            }
            this.awaitReady(() => {
                const acknowledgementId: string = this.getNextMessageId().toString();
                this.rpcTransactions[acknowledgementId] = {
                    callback: (response: any, error: any) => {
                        // Clear and delete rpc
                        clearTimeout(this.rpcTransactions[acknowledgementId].timer);
                        delete this.rpcTransactions[acknowledgementId];
                        error ? reject(error) : resolve();
                    },
                    timer: setTimeout(() => {
                        this.rpcTransactions[acknowledgementId].callback(undefined, new Error('Acknowledgement timed out.'));
                    }, this.responseTimeout)
                };

                if (this.transport) this.transport.send(JSON.stringify(packet));
            });
        });
    }

    public request(message: string, data: any = {}) {
        return new Promise((resolve, reject) => {
            const requestId = this.getNextMessageId().toString();
            const packet = {
                m: message,
                d: data,
                r: requestId
            };

            this.awaitReady(() => {
                if (this.transport) {
                    this.transport.send(JSON.stringify(packet));

                    this.rpcTransactions[requestId] = {
                        callback: (response: any, error?: Error) => {
                            // Clear and delete rpc
                            clearTimeout(this.rpcTransactions[requestId].timer);
                            delete this.rpcTransactions[requestId];
                            error ? reject(error) : resolve();
                        },
                        timer: setTimeout(() => {
                            // Timed out in acknowledging response
                            this.rpcTransactions[requestId].callback(undefined, new Error('Response timed out.'));
                        }, this.responseTimeout)
                    };
                }
            });
        });
    }

    public close(code?: StatusCode, reason?: string) {
        this.changeState(State.closing);
        if (this.transport) this.transport.close(code, reason);

        // Clean up events
        this.changeState(State.closed);
        this.stopHeartbeat();
        Object.keys(this.rpcTransactions).forEach((transactionId) => {
            this.rpcTransactions[transactionId].callback(undefined, 'Connection closed');
        });
    }

}