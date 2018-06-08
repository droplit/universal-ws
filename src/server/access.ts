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

    // A new connection that is yet to be authenticated or established
    public connection(connection: WsContext) {
        this.emit('connection', connection);
    }

    // A new authenticated/established connection
    public connected(connection: WsContext) {
        this.emit('connected', connection);
    }

    // A connection dropped or closed
    public disconnected(connection: WsContext) {
        this.emit('close', connection);
    }

    // Request a specific connection to authenticate
    public requestAuthentication(connection: WsContext) {
        this.session.requestAuthentication(connection);
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (clientId: string, data: any, context: any) => void) {
        this.session.on('message', (message, clientId, data, context) => {
            handler(clientId, data, context);
        });
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (clientId: string, data: any, context: any, callback: (result: any, expectAcknowledgement: boolean, timeout: number) => Promise<any>) => void) {
        this.session.on('request', (message, clientId, data, context, callback) => {
            handler(clientId, data, context, callback);
        });
    }
}