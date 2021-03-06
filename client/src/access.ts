import { Session, StatusCode, ConnectionOptions, State, HeartbeatMode } from './session';
import { EventEmitter } from 'events';

export { StatusCode, ConnectionOptions } from './session';
export class UniversalWebSocket extends EventEmitter {
    private session: Session;
    public state: State = State.closed;
    public readonly heartbeatMode: HeartbeatMode;
    public readonly heartbeatInterval: number;
    public responseTimeout: number;

    constructor(host: string, connectionOptions?: ConnectionOptions, ...parameters: string[]) {
        super();
        this.session = new Session(host, connectionOptions, ...parameters);
        this.heartbeatMode = this.session.heartbeatMode;
        this.heartbeatInterval = this.session.heatbeatInterval;
        this.responseTimeout = this.session.responseTimeout;

        this.session.on('connected', () => {
            this.emit('connected');
        });
        this.session.on('disconnected', (code?: StatusCode | number, reason?: string) => {
            this.emit('disconnected', code, reason);
        });
        this.session.on('message', (message: string, data: any) => {
            this.emit(message, data);
        });
        this.session.on('request', (message: string, data: any, callback: (data: any, ack?: boolean) => Promise<void>) => {
            this.emit(message, data, callback);
        });
        this.session.on('state', (state: State) => {
            this.state = state;
            this.emit('state', this.state);
        });
        this.session.on('error', (error: any) => {
            this.emit('error', error);
        });
    }

    public negotiate(settings: { heartbeatMode?: HeartbeatMode, heartbeatInterval?: number }) {
        return this.session.negotiate(settings);
    }

    public send(message: string, data?: any) {
        this.session.send(message, data);
    }

    public sendWithAck(message: string, data?: any) {
        return this.session.sendWithAck(message, data);
    }

    public request<T>(message: string, data?: any) {
        return this.session.request<T>(message, data);
    }

    public close(code: StatusCode = StatusCode.Normal_Closure , reason?: string) {
        return this.session.close(code, reason);
    }

    public open() {
        return this.session.open();
    }
}