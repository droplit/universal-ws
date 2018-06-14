import { EventEmitter } from 'events';
import { Session, WsContext } from './session';
import * as http from 'http';

export class Access extends EventEmitter {

    private session: Session;

    constructor(server: http.Server, authenticator?: (connection: WsContext) => Promise<boolean>) {
        super();
        this.session = new Session(server, authenticator);
        this.session.on('connection', this.connection);
        this.session.on('connected', this.connected);
        this.session.on('close', this.disconnected);
    }

    // A new connection that is yet to be authenticated nor established
    private connection(connection: WsContext) {
        this.emit('connection', connection);
    }

    // A new authenticated/established connection
    private connected(connection: WsContext) {
        this.emit('connected', connection);
    }

    // A connection dropped or closed
    private disconnected(connection: WsContext) {
        this.emit('close', connection);
    }

    // Request a specific connection to authenticate
    public requestAuthentication(connection: WsContext, onAuthenticated: (error?: any) => void) {
        this.session.requestAuthentication(connection, onAuthenticated);
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (clientId: string, data: any, context: any) => void) {
        this.session.on(`@${message}`, (clientId, data, context) => {
            handler(clientId, data, context);
        });
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (clientId: string, data: any, context: any, callback: (result: any, timeout: number, onAcknowledge: (response: any, error?: any) => void) => Promise<any>) => void) {
        this.session.on(`#${message}`, (clientId, data, context, callback) => {
            handler(clientId, data, context, callback);
        });
    }

    public sendMessage(connection: WsContext, message: string, data?: any) {
        this.session.sendMessage(connection, message, data);
    }

    public makeRequest(connection: WsContext, message: string, data: any, callback: (response: any, error?: any) => void) {
        this.session.makeRequest(connection, message, data, callback);
    }
}