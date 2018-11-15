import { Session, WsOptions, WsContext, StatusCode, PerMessageDeflateOptions } from './session';
import { Server } from 'http';

export { WsContext, StatusCode, WsOptions, PerMessageDeflateOptions } from './session';

export class UniversalWebSocketServer<Context = any> {

    private session: Session;

    constructor(server: Server, perMessageDeflateOptions?: PerMessageDeflateOptions, options?: WsOptions) {
        this.session = new Session(server, authenticator, perMessageDeflateOptions, options);
    }

    // Listen for a new connection that is yet to be authenticated nor established
    public onConnection(listener: (connection: WsContext<Context>) => void) {
        if (this.session.listeners('connection').length < 1) {
            this.session.on('connection', listener);
        }
    }

    // Listen for a new successful/authenticated connection
    public onConnected(listener: (connection: WsContext<Context>) => void) {
        if (this.session.listeners('connected').length < 1) {
            this.session.on('connected', listener);
        }
    }

    // Listen for a closed/dropped connection
    public onDisconnected(listener: (connection: WsContext<Context>) => void) {
        if (this.session.listeners('close').length < 1) {
            this.session.on('close', listener);
        }
    }

    // Request a specific connection to authenticate
    public requestAuthentication(connection: WsContext<Context>, onAuthenticated: (error?: any) => void) {
        this.session.requestAuthentication(connection, onAuthenticated);
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (connection: WsContext<Context>, data: any, context: Context) => void) {
        if (this.session.listeners(`@${message}`).length < 1) { // Event listener does not exist yet
            this.session.on(`@${message}`, (connection, data, context) => {
                handler(connection, data, context);
            });
        }
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (connection: WsContext<Context>, data: any, context: Context, callback: (result: any, onAcknowledge?: (response: any, error?: any) => void, acknowledgementTimeout?: number) => Promise<any>) => void) {
        if (this.session.listeners(`#${message}`).length < 1) {
            this.session.on(`#${message}`, (connection, data, context, callback) => {
                handler(connection, data, context, callback);
            });
        }
    }

    public sendMessage(connection: WsContext<Context>, message: string, data?: any) {
        this.session.sendMessage(connection, message, data);
    }

    public makeRequest(connection: WsContext<Context>, message: string, data: any, callback: (response: any, error?: any) => void) {
        this.session.makeRequest(connection, message, data, callback);
    }

    public close(connection: WsContext<Context>, code: StatusCode, message?: string) {
        this.session.close(connection, code, message);
    }
}