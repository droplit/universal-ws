import { EventEmitter } from 'events';
import { Session, WsOptions, WsContext, StatusCode, PerMessageDeflateOptions } from './session';
import { Server } from 'http';

export { WsContext, StatusCode, WsOptions, PerMessageDeflateOptions } from './session';
export class UniversalWebSocketServer<Context = any> extends EventEmitter {

    private session: Session;

    constructor(server: Server, authenticator?: (connection: WsContext<Context>) => Promise<boolean>, perMessageDeflateOptions?: PerMessageDeflateOptions, options?: WsOptions) {
        super();
        this.session = new Session(server, authenticator, perMessageDeflateOptions, options);
        this.session.on('connection', this.connection.bind(this));
        this.session.on('connected', this.connected.bind(this));
        this.session.on('close', this.disconnected.bind(this));
    }

    // A new connection that is yet to be authenticated nor established
    private connection(connection: WsContext<Context>) {
        this.emit('connection', connection);
    }

    // A new authenticated/established connection
    private connected(connection: WsContext<Context>) {
        this.emit('connected', connection);
    }

    // A connection dropped or closed
    private disconnected(connection: WsContext<Context>) {
        this.emit('close', connection);
    }

    // Request a specific connection to authenticate
    public requestAuthentication(connection: WsContext<Context>, onAuthenticated: (error?: any) => void) {
        this.session.requestAuthentication(connection, onAuthenticated);
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (clientId: string, data: any, context: Context) => void) {
        if (this.session.listeners(`@${message}`).length < 1) { // Event listener does not exist yet
            this.session.on(`@${message}`, (clientId, data, context) => {
                handler(clientId, data, context);
            });
        }
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (clientId: string, data: any, context: Context, callback: (result: any, timeout: number, onAcknowledge: (response: any, error?: any) => void) => Promise<any>) => void) {
        if (this.session.listeners(`#${message}`).length < 1) {
            this.session.on(`#${message}`, (clientId, data, context, callback) => {
                handler(clientId, data, context, callback);
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