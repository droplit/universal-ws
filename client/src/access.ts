import { EventEmitter } from 'events';
import { Session, StatusCode } from './session';

export class UniversalWebSocket extends EventEmitter {
    private session: Session;

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

        this.session = new Session(host, options, onConnected);

        this.session.on('connection', (data: any) => {
            this.onConnection(data);
        });

        this.session.on('connected', (data: any) => {
            this.onConnected(data);
        });

        this.session.on('close', (code: StatusCode, reason: string) => {
            this.onClose(code, reason);
        });

        this.session.on('error', (data: any) => {
            this.onError(data);
        });
    }

    private onConnection(data: any) {
        this.emit('connection', data);
    }

    private onConnected(data: any) {
        this.emit('connected', data);
    }

    private onClose(code: StatusCode, reason: string) {
        this.emit('close', code, reason);
    }

    private onError(data: any) {
        this.emit('error', data);
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (data: any) => void) {
        this.session.on(`@${message}`, (data) => {
            handler(data);
        });
    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (id: string, data: any, context: any, callback: (result: any, timeout: number, onAcknowledge: (response: any, error?: any) => void) => Promise<any>) => void) {
        this.session.on(`#${message}`, (id, data, context, callback) => {
            handler(id, data, context, callback);
        });
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
}