const bs58 = require('bs58');
const DELIMITER = '$';

export enum Type {
    Browser,
    Node
}

export enum ReadyState {
    Connecting,
    Open,
    Closing,
    Closed
}

export enum StatusCode {
    Normal_Closure = 1000,
    Going_Away,
    Protocol_Error,
    Unexpected_Data,
    Invalid_Data = 1007,
    Message_Error,
    Message_Too_Large,
    Unexpected_Error = 1011
}

export class UniversalWs {
    private ws?: import('ws') | WebSocket;

    constructor(host: string, options: { parameters?: string[], perMessageDeflateOptions?: any }) {
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
        if (typeof WebSocket !== 'undefined') {
            this.ws = options.parameters ? new WebSocket(host, [this.encodeParameters(options.parameters)]) : new WebSocket(host);
            return;
        }
        try {
            const ws = require('ws');
            if (ws) {
                this.ws = options.parameters ? new ws(host, [this.encodeParameters(options.parameters)], options.perMessageDeflateOptions) : new ws(host, options.perMessageDeflateOptions);
                return;
            }
        } catch {
            throw new Error('Cannot construct WebSocket! Your environment may not support web sockets. See: https://caniuse.com/#feat=websockets');
        }
    }

    private encodeParameters(parameters: string[]) {
        return bs58.encode(Buffer.from(parameters.join(DELIMITER), 'utf8'));
    }

    public on(eventName: 'open' | 'message' | 'close' | 'error', callback: any) {
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            switch (eventName) {
                case 'open':
                    this.ws.addEventListener('open', (event: Event) => callback(event));
                    break;
                case 'message':
                    this.ws.addEventListener('message', (event: MessageEvent) => {
                        callback(event.data);
                    });
                    break;
                case 'close':
                    this.ws.addEventListener('close', (event: CloseEvent) => callback({ code: event.code, reason: event.reason }));
                    break;
                case 'error':
                    this.ws.addEventListener('error', (event: Event) => callback(event));
                    break;
                default:
                    throw (`Invalid event name ${eventName}`);
            }
        } else {
            switch (eventName) {
                case 'open':
                    this.ws.on('open', callback);
                    break;
                case 'message':
                    this.ws.on('message', (data: import('ws').Data) => callback(data));
                    break;
                case 'close':
                    this.ws.on('close', (code: number, reason: string) => callback({ code, reason }));
                    break;
                case 'error':
                    this.ws.on('error', (error: Error) => callback(error));
                    break;
                default:
                    throw (`Invalid event name ${eventName}`);
            }
        }
    }

    public send(message: string) {
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            this.ws.send(message);
        } else {
            this.ws.send(message);
        }
    }

    public close(code: number = 1000, reason: string = '') {
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            this.ws.close(code, reason);
        } else {
            this.ws.close(code, reason);
        }
    }

    public getReadyState() {
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            return ReadyState[this.ws.readyState];
        } else {
            return ReadyState[this.ws.readyState];
        }
    }
}

function isBrowser(ws: import('ws') | WebSocket): ws is WebSocket {
    return typeof WebSocket !== 'undefined';
}