import { EventEmitter } from 'events';
import * as retry from 'retry';
import { UniversalWs as WebSocket, StatusCode } from './transport';

export { StatusCode } from './transport';

export interface StandardPacket {
    t?: 'hb' | 'hbr' | 'hbrx' | 'hbtx' | string;
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
    Acknowledgement
}

export class Session extends EventEmitter {
    private host: string;
    private transport?: WebSocket;
    private expires: any;
    private polls: any;
    private waiting: (() => void)[] = [];
    private isOpen = false;
    private conserveBandwidth = false;
    private pollRateRange = { minimum: 1000, maximum: 10000 };
    private timeoutRange = { minimum: 20000, maximum: 60000 };
    private timeout: number;
    private pollRate: number;
    private rpcTransactions: {
        [transactionId: string]: {
            timer: any;
            callback: (response: any, error?: any) => void;
        }
    } = {};
    private readonly connectOperation = retry.operation({
        factor: 1.5,
        minTimeout: 500,
        maxTimeout: 5000,
        randomize: true,
        forever: true
    });

    constructor(
        host: string,
        options?: {
            pollRate?: number | { minimum: number, maximum: number },
            timeout?: number | { minimum: number, maximum: number },
            conserveBandwidth: boolean;
        },
        onConnected?: (connected: boolean) => void
    ) {
        super();

        this.host = host;
        if (options) {
            if (options.pollRate) {
                if (typeof options.pollRate === 'number') {
                    this.pollRateRange.minimum = this.pollRateRange.maximum = options.pollRate;
                } else if (typeof options.pollRate === 'object'
                    && options.pollRate !== null
                    && typeof options.pollRate.minimum === 'number'
                    && typeof options.pollRate.maximum === 'number'
                    && options.pollRate.minimum > 0) {
                    if (options.pollRate.maximum > options.pollRate.minimum) {
                        this.pollRateRange = options.pollRate;
                    } else {
                        throw new Error('Pollrate maximum must be larger than minimum');
                    }
                } else {
                    throw new Error('Pollrate must be a positive integer or an object containing minimum or maximum positive integers');
                }
            }
            if (options.timeout) {
                if (typeof options.timeout === 'number') {
                    if (options.timeout > this.pollRateRange.maximum) {
                        this.timeoutRange.minimum = this.timeoutRange.maximum = options.timeout;
                    } else {
                        throw new Error('Timeout must be larger than pollrate maximum');
                    }
                } else if (typeof options.timeout === 'object'
                    && options.timeout !== null
                    && typeof options.timeout.minimum === 'number'
                    && typeof options.timeout.maximum === 'number'
                    && options.timeout.minimum > 0) {
                    if (options.timeout.maximum > options.timeout.minimum) {
                        if (options.timeout.maximum > this.pollRateRange.maximum) {
                            if (options.timeout.minimum > this.pollRateRange.minimum) {
                                this.timeoutRange = options.timeout;
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
        this.timeout = this.conserveBandwidth ? this.timeoutRange.maximum : this.timeoutRange.minimum;
        this.pollRate = this.conserveBandwidth ? this.pollRateRange.maximum : this.pollRateRange.minimum;

        this.start(onConnected);
    }

    private start(onConnected?: (connected: boolean) => void) {
        this.retryConnect(onConnected);
    }

    private retryConnect(onConnected?: (connected: boolean) => void) {
        this.connectOperation.attempt((currentAttempt: number) => {
            this.restart((connected: boolean, error?: any) => {
                if (this.connectOperation.retry(error)) {
                    return;
                }

                if (onConnected) onConnected(connected);
            });
        });
    }

    private async restart(onConnected?: (connected: boolean) => void) {
        try {
            this.transport = new WebSocket();
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
        this.emit(`#${packet.m}`, packet.r, packet.d, (result: any, timeout: number = 5000, onAcknowledge?: (response: any, error?: any) => void) => {
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
                    }, timeout)
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

    // NO LONGER NECESSARY?
    // private sendHeartbeat() {
    //     this.transport.send(JSON.stringify({ t: 'hb' }));
    // }

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