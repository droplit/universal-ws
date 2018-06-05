import { Session, WsContext } from './session';
import * as http from 'http';

export class Access {

    private session: Session;

    constructor(server: http.Server, authenticator?: (connection: WsContext) => boolean) {
        this.session = new Session(server, authenticator);

    }

    public onMessage(message: string, handler: (clientId: string, data: any, context: any) => void) {
        this.session.on(`${message}`, (clientId, data, context) => {
            handler(clientId, data, context);
        });
    }

    // public onRequest(message: string, handler: (clientId: string, data: any, context: any, )) HOW DIFFERENTIATE? IS IT NECESSARY?
}