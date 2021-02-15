import { EventEmitter } from 'events';
import * as retry from 'retry';
import { UniversalWs as Transport, StatusCode } from './transport';
import { PerMessageDeflateOptions } from 'ws';

export { StatusCode } from './transport';

enum ReservedPacketTypes {
    Heartbeat = 'hb',
    HeartbeatRequest = 'hbr',
    NegotiateSettings = 'ns'
}

export interface StandardPacket {
    t?: ReservedPacketTypes | string;
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
    heatbeatInterval?: number;
    heartbeatMode?: HeartbeatMode;
    heartbeatModeTimeoutMultiplier?: number | (() => number);
    autoConnect?: boolean;
    perMessageDeflateOptions?: PerMessageDeflateOptions;
    retryOptions?: retry.OperationOptions;
    retryConnectionStatusCodes?: number[];
}

export class Session extends EventEmitter {
    private transport?: Transport;
    private heartbeatPolling!: NodeJS.Timer;
    private expires?: NodeJS.Timer;
    private waiting?: (() => void)[] = [];
    private rpcTransactions: {
        [transactionId: string]: {
            timer: any;
            callback: (response: any, error?: any) => void;
        }
    } = {};
    private connectionTimeout = 60;
    public responseTimeout = 15;
    private parameters?: string[];
    private heartbeatModeTimeoutMultiplier: number | (() => number) = 2.5;
    private autoConnect = true;
    private perMessageDeflateOptions?: PerMessageDeflateOptions;
    private retryOptions: retry.OperationOptions;
    private retryConnectionStatusCodes: number[] = [];
    private connectOperation?: retry.RetryOperation;

    public heatbeatInterval = 1;
    public heartbeatMode: HeartbeatMode = HeartbeatMode.roundtrip;
    public state: State = State.closed;

    constructor(private host: string, options?: ConnectionOptions, ...parameters: string[]) {
        super();

        if (!options) options = {}; // Fill if empty
        if (options.connectionTimeout) this.connectionTimeout = options.connectionTimeout;
        if (options.responseTimeout) this.responseTimeout = options.responseTimeout;
        if (options.heatbeatInterval) this.heatbeatInterval = options.heatbeatInterval;
        if (options.heartbeatMode) this.heartbeatMode = options.heartbeatMode;
        if (options.heartbeatModeTimeoutMultiplier) this.heartbeatModeTimeoutMultiplier = options.heartbeatModeTimeoutMultiplier;
        if (options.autoConnect) this.autoConnect = options.autoConnect;
        if (options.perMessageDeflateOptions) this.perMessageDeflateOptions = options.perMessageDeflateOptions;
        if (options.retryConnectionStatusCodes) this.retryConnectionStatusCodes = options.retryConnectionStatusCodes;
        this.retryOptions = options.retryOptions ? options.retryOptions : {
            factor: 1.5,
            minTimeout: .5 * 1000,
            maxTimeout: 60 * 1000,
            randomize: true,
            forever: true
        };
        if (parameters && parameters.length) this.parameters = parameters;

        if (this.autoConnect) {
            this.resetAndAttemptConnectOperation();
        }
    }

    private changeState(state: State) {
        this.state = state;
        this.emit('state', state);
    }

    private resetAndAttemptConnectOperation() {
        if (this.connectOperation) {
            this.connectOperation.stop();
            this.connectOperation.reset();
        }
        this.connectOperation = retry.operation(this.retryOptions);
        this.connectOperation.attempt((currentAttempt: number) => {
            this.connect();
        }, {
            timeout: this.connectionTimeout * 1000, cb: () => {
                if (this.connectOperation) this.connectOperation.retry(new Error('Connection timed out.'));
            }
        } as any);
    }

    private connect() {
        this.transport = new Transport(this.host, { parameters: this.parameters, perMessageDeflateOptions: this.perMessageDeflateOptions });
        this.transport.on('message', (data: any) => {
            this.handleMessage(data);
        });
        this.transport.on('close', (data: { code: StatusCode, reason: string }) => {
            const closeError = this.resolveErrorFromCloseEvent(data);
            if (this.connectOperation) {
                if (closeError) this.connectOperation.retry(closeError);
                else this.connectOperation.stop();
            } else {
                if (closeError) this.resetAndAttemptConnectOperation();
                else { } // Do nothing
            }
            this.handleClose(data);
        });

        this.transport.on('error', (data: any) => {
            this.handleError(data);
        });
        this.transport.on('open', (data: any) => {
            delete this.connectOperation;
            this.connectionReady();
        });
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
            // Node 10.2.0: this.expires.refresh();
            clearTimeout(this.expires);
            this.expires = setTimeout(() => {
                this.onConnectionInactive();
            }, this.heatbeatInterval * (typeof this.heartbeatModeTimeoutMultiplier === 'number' ? this.heartbeatModeTimeoutMultiplier : this.heartbeatModeTimeoutMultiplier()) * 1000);
        } else {
            this.expires = setTimeout(() => {
                this.onConnectionInactive();
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
                case ReservedPacketTypes.Heartbeat: // Server responds to client's heartbeat request
                    return PacketType.Heartbeat;
                case ReservedPacketTypes.NegotiateSettings: // Server responds to client's negotiate settings
                    return PacketType.NegotiateSettings;
                default: // Server acknowledges a response from the client
                    return PacketType.Acknowledgement;
            }
        } else { // Handle simple messages from the client
            return PacketType.Message; // Simple message from the client
        }
    }

    private handleClose(data: { code: StatusCode, reason: string }) {
        this.transport = undefined;
        // Callback all existing rpc's with an error
        Object.keys(this.rpcTransactions).forEach((transactionId) => {
            this.rpcTransactions[transactionId].callback(undefined, 'Connection closed');
        });

        this.onConnectionInactive({ code: data.code, reason: data.reason });
    }

    // Returns an error and the client will retry to connect
    private resolveErrorFromCloseEvent(data: { code: StatusCode, reason: string }) {
        switch (data.code) {
            case StatusCode.Normal_Closure:
            case StatusCode.Going_Away:
            case StatusCode.Protocol_Error:
            case StatusCode.No_Status_Code_Present:
                return;
            case StatusCode.Invalid_Data:
                // Retry on 1006
                return new Error('Connection was closed abnormally. Possibly server unreachable');
            case StatusCode.Message_Error:
            case StatusCode.Unexpected_Error:
                // Do not reconnect, unknown server error
                return;
            case undefined:
                // Code not recieved
                this.handleError(new Error(`No status code recieved on server close: ${data.code}`));
                return;
            default:
                if (this.retryConnectionStatusCodes.includes(data.code)) return new Error(`Retrying connection on custom status code: ${data.code}`);
                this.handleError(new Error(`Unknown status code recieved on server close: ${data.code}`));
                return;
        }
    }

    private handleError(data: any) {
        this.emit('error', data);
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

    // Called whenever connection is active
    private onConnectionActive() {
        if (this.state === State.open) {
            this.resetTimeout();
        }
    }

    // Called when the connection is considered inactive
    private onConnectionInactive(data?: { code: StatusCode, reason: string }) {
        this.changeState(State.closing);
        this.stopHeartbeat();
        if (data) {
            this.emit('disconnected', data.code, data.reason);
        } else {
            this.emit('disconnected');
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
        this.emit('message', `#${packet.m}`, packet.d);
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
                return new Promise<void>((resolve, reject) => {
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
                        }, this.responseTimeout * 1000)
                    };
                    if (this.transport) this.transport.send(JSON.stringify(response));
                });
            } else {
                if (this.transport) this.transport.send(JSON.stringify(response));
                return;
            }
        };

        this.emit('request', `@${packet.m}`, packet.d, callback);
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
        if (this.transport) this.transport.send(JSON.stringify({ t: ReservedPacketTypes.Heartbeat }));
    }

    private requestHeartbeat() {
        if (this.transport) this.transport.send(JSON.stringify({ t: ReservedPacketTypes.HeartbeatRequest }));
    }

    private messageIdSeed = 0; // rotating id for messages

    private getNextMessageId() {
        if (this.messageIdSeed === Number.MAX_SAFE_INTEGER) this.messageIdSeed = 0; // Reset to 0
        return ++this.messageIdSeed;
    }

    public negotiate(settings: { heartbeatMode?: HeartbeatMode, heartbeatInterval?: number }) {
        return new Promise<{ approve: boolean, supportedOptions?: SupportedOptions }>((resolve, reject) => {
            const packet: Partial<StandardPacket> = {
                t: ReservedPacketTypes.NegotiateSettings,
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
                    }, this.responseTimeout * 1000)
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
                packet.i = acknowledgementId;
                this.rpcTransactions[acknowledgementId] = {
                    callback: (response: any, error: any) => {
                        // Clear and delete rpc
                        clearTimeout(this.rpcTransactions[acknowledgementId].timer);
                        delete this.rpcTransactions[acknowledgementId];
                        error ? reject(error) : resolve();
                    },
                    timer: setTimeout(() => {
                        this.rpcTransactions[acknowledgementId].callback(undefined, new Error('Acknowledgement timed out.'));
                    }, this.responseTimeout * 1000)
                };

                if (this.transport) this.transport.send(JSON.stringify(packet));
            });
        });
    }

    public request<T = any>(message: string, data: any = {}) {
        return new Promise<T>((resolve, reject) => {
            const requestId = this.getNextMessageId();
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
                            error ? reject(error) : resolve(response);
                        },
                        timer: setTimeout(() => {
                            // Timed out in acknowledging response
                            this.rpcTransactions[requestId].callback(undefined, new Error('Response timed out.'));
                        }, this.responseTimeout * 1000)
                    };
                }
            });
        });
    }

    public close(code?: StatusCode | number, reason?: string) {
        this.changeState(State.closing);
        delete this.connectOperation;
        if (this.transport) this.transport.close(code, reason);

        // Clean up events
        this.changeState(State.closed);
        this.stopHeartbeat();
        Object.keys(this.rpcTransactions).forEach((transactionId) => {
            this.rpcTransactions[transactionId].callback(undefined, 'Connection closed');
        });
    }

    public open() {
        if (this.state === State.closed) {
            this.connect();
            return;
        } else {
            return new Error(`Cannot open. Current state is: ${this.state}`);
        }
    }
}