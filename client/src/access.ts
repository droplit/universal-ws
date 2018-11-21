import { Session, StatusCode } from './session';

export type handlerId = string;

export class UniversalWebSocket {
    private session: Session;

    private handlersCount = 0;
    private handlers: {
        [handlerId: string]: {
            type: 'connection' | 'connected' | 'close' | string,
            handler: any
        }
    } = {};

    constructor(
        host: string,
        options?: {
            pollRate?: number | { minimum: number, maximum: number },
            timeout?: number | { minimum: number, maximum: number },
            conserveBandwidth: boolean;
        },
        onConnected?: (connected: boolean) => void
    ) {
        this.session = new Session(host, options, onConnected);
    }

    public removeHandler(handlerId: handlerId) {
        const handler = this.handlers[handlerId];
        if (handler) {
            this.session.removeListener(handler.type, handler.handler);
        } else {

        }
    }

    // Listen for when a connection is established/ready
    public onConnected(handler: () => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: 'connected',
            handler
        };
        this.session.on('connected', handler);
        return handlerId;
    }

    // Listen for when a connection has closed/dropped
    public onClose(handler: (code: StatusCode, reason: string) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: 'close',
            handler
        };
        this.session.on('close', handler);
        return handlerId;
    }

    // Listen for when a connection encounters an error
    public onError(handler: (data: any) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: 'error',
            handler
        };
        this.session.on('error', handler);
        return handlerId;
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (data: any) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: `@${message}`,
            handler
        };
        this.session.on(`@${message}`, handler);
        return handlerId;
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (data: any, context: any, callback: (result: any, onAcknowledge?: (response: any, error?: any) => void, acknowledgementTimeout?: number) => Promise<any>) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: `#${message}`,
            handler
        };
        this.session.on(`#${message}`, handler);
        return handlerId;
    }

    public sendMessage(message: string, data?: any) {
        this.session.sendMessage(message, data);
    }

    public makeRequest(message: string, data: any, callback: (response: any, error?: any) => void) {
        this.session.makeRequest(message, data, callback);
    }

    public close(code?: StatusCode, message?: string) {
        this.session.close(code, message);
    }

    private newListenerId(): handlerId {
        if (this.handlersCount === Number.MAX_SAFE_INTEGER) this.handlersCount = 0; // Reset to 0
        return `${++this.handlersCount}`;
    }
}