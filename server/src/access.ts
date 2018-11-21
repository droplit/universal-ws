import { Session, Options, Context, StatusCode } from './session';
import { Server } from 'http';

export { Context, StatusCode, Options, PerMessageDeflateOptions } from './session';

export type handlerId = string;

export class UniversalWebSocketServer<T = any> {

    private session: Session;
    private handlersCount = 0;
    private handlers: {
        [handlerId: string]: {
            type: 'connection' | 'connected' | 'close' | string,
            handler: any
        }
    } = {};

    constructor(server: Server, options?: Options) {
        this.session = new Session(server, options);
    }

    public removeHandler(handlerId: handlerId) {
        const handler = this.handlers[handlerId];
        if (handler) {
            this.session.removeListener(handler.type, handler.handler);
        } else {

        }
    }

    public setAuthenticator(authenticator: (connection: Context<T>) => Promise<boolean>) {
        this.session.setAuthenticator(authenticator);
    }

    // Listen for a new connection that is yet to be authenticated nor established
    public onConnection(handler: (connection: Context<T>) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: 'connection',
            handler
        };
        this.session.on('connection', handler);
        return handlerId;
    }

    // Listen for a new successful/authenticated connection
    public onConnected(handler: (connection: Context<T>) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: 'connected',
            handler
        };
        this.session.on('connected', handler);
        return handlerId;
    }

    // Listen for a closed/dropped connection
    public onDisconnected(handler: (connection: Context<T>) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: 'close',
            handler
        };
        this.session.on('close', handler);
        return handlerId;
    }

    // Request a specific connection to authenticate
    public requestAuthentication(connection: Context<T>, onAuthenticated: (error?: any) => void) {
        this.session.requestAuthentication(connection, onAuthenticated);
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (connection: Context<T>, data: any, context: Context) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: `@${message}`,
            handler
        };
        this.session.on(`@${message}`, handler);
        return handlerId;
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (connection: Context<T>, data: any, context: Context, callback: (result: any, onAcknowledge?: (response: any, error?: any) => void, acknowledgementTimeout?: number) => Promise<any>) => void): handlerId {
        const handlerId = this.newListenerId();
        this.handlers[handlerId] = {
            type: `#${message}`,
            handler
        };
        this.session.on(`#${message}`, handler);
        return handlerId;
    }

    public sendMessage(connection: Context<T>, message: string, data?: any) {
        this.session.sendMessage(connection, message, data);
    }

    public makeRequest(connection: Context<T>, message: string, data: any, callback: (response: any, error?: any) => void) {
        this.session.makeRequest(connection, message, data, callback);
    }

    public close(connection: Context<T>, code: StatusCode, message?: string) {
        this.session.close(connection, code, message);
    }

    private newListenerId(): handlerId {
        if (this.handlersCount === Number.MAX_SAFE_INTEGER) this.handlersCount = 0; // Reset to 0
        return `${++this.handlersCount}`;
    }
}