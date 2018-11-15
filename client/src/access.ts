import { Session, StatusCode } from './session';

export class UniversalWebSocket {
    private session: Session;

    private messages: {[messageName: string]: {[messageId: string]: callback}}

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

    // Listen for when a connection is established/ready
    public onConnected(listener: () => void) {
        if (this.session.listeners('connected').length < 1) { // Listener does not yet exist
            this.session.on('connected', () => {
                listener();
            });
        }
    }

    // Listen for when a connection has closed/dropped
    public onClose(listener: (code: StatusCode, reason: string) => void) {
        if (this.session.listeners('close').length < 1) {
            this.session.on('close', (code, reason) => {
                listener(code, reason);
            });
        }
    }

    // Listen for when a connection encounters an error
    public onError(listener: (data: any) => void) {
        if (this.session.listeners('error').length < 1) {
            this.session.on('error', (data) => {
                listener(data);
            });
        }
    }

    // Add a handler for a message
    public onMessage(message: string, handler: (data: any) => void) {
        this.messageHandlers[message].push(handler);

        if (this.session.listeners(`@${message}`).length < 1) { // Listener does not yet exist
            this.session.on(`@${message}`, (data) => {
                handler(data);
            });
        }
    }

    public removeOnMessage(message: string, handler: (data: any) => void) {

    }

    // Add a handler for a request and (optional) receive acknowledgement
    public onRequest(message: string, handler: (data: any, context: any, callback: (result: any, onAcknowledge?: (response: any, error?: any) => void, acknowledgementTimeout?: number) => Promise<any>) => void) {
        if (this.session.listeners(`#${message}`).length < 1) { // Listener does not yet exist
            this.session.on(`#${message}`, (data, context, callback) => {
                handler(data, context, callback);
            });
        }
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