import { Session, Options, StatusCode, Client } from './session';
import { Server } from 'http';
import { EventEmitter } from 'events';

export { Client, StatusCode, Options, PerMessageDeflateOptions } from './session';

export class UniversalWebSocketServer<Context = any> extends EventEmitter {

    private session: Session<Context>;

    public clients: Client[];

    constructor(server: Server, options?: Options) {
        super();
        this.session = new Session<Context>(server, options);
        this.clients = this.session.clients;

        this.session.on('connected', (client: Client<Context>) => {
            this.emit('connected', client);
        });
        this.session.on('disconnected', (client: Client<Context>) => {
            this.emit('disconnected', client);
        });
        this.session.on('message', (message, client: Client<Context>, data) => {
            this.emit(message, client, data);
        });
        this.session.on('message', (message, client: Client<Context>, data) => {
            this.emit(message, client, data);
        });
        this.session.on('request', (message, client: Client<Context>, data, callback: (data: any, ack?: boolean) => Promise<void>) => {
            this.emit(message, client, data, callback);
        });
    }

    public send(client: Client<Context>, message: string, data: any) {
        this.session.send(client, message, data);
    }

    public sendWithAck(client: Client<Context>, message: string, data: any) {
        return this.session.sendWithAck(client, message, data);
    }

    public request(client: Client<Context>, message: string, data: any) {
        return this.session.request(client, message, data);
    }

    public close(client: Client<Context>, code: StatusCode, reason: string) {
        return this.session.close(client, code, reason);
    }

}