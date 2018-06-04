import 'source-map-support/register';
// import * as events from 'events';
import * as nodeWs from './node';

export enum Type {
    Browser,
    Node
}

export enum ReadyState {
    Connecting,
    Open,
    Closing,
    Closed
}

export class UniversalWs {
    private ws: any;
    private type: Type;

    constructor(host: string) {
        let browserSocket: any;

        if (typeof WebSocket !== 'undefined') {
            browserSocket = WebSocket;
            this.type = Type.Browser;
        } else if (typeof global !== 'undefined' && typeof (global as any).WebSocket !== 'undefined') {
            browserSocket = (global as any).Websocket;
            this.type = Type.Browser;
        } else if (typeof global !== 'undefined' && typeof (global as any).MozWebSocket !== 'undefined') {
            browserSocket = (global as any).MozWebSocket;
            this.type = Type.Browser;
        } else if (typeof window !== 'undefined' && typeof (window as any).MozWebSocket !== 'undefined') {
            browserSocket = (window as any).MozWebSocket;
            this.type = Type.Browser;
        } else if (typeof self !== 'undefined' && typeof (self as any).MozWebSocket !== 'undefined') {
            browserSocket = (self as any).MozWebSocket;
            this.type = Type.Browser;
        } else {
            this.ws = new nodeWs.ws(host);
            this.type = Type.Node;
        }

        if (this.type === Type.Browser) {
            this.ws = new browserSocket(host);
        }
    }

    public on(eventName: 'open' | 'message' | 'close' | 'error', callback: any) {
        if (this.type === Type.Browser && this.ws instanceof WebSocket) {
            switch (eventName) {
                case 'open':
                    this.ws.addEventListener('open', (data: any) => callback(data));
                    break;
                case 'message':
                    this.ws.addEventListener('message', (data: any) => callback(data));
                    break;
                case 'close':
                    this.ws.addEventListener('close', (data: { code: number, reason: string, wasClean: boolean }) => callback({ code: data.code, reason: data.reason }));
                    break;
                case 'error':
                    this.ws.addEventListener('error', (data: any) => callback(data));
                    break;
                default:
                    throw (`Invalid event name ${eventName}`);
            }
        } else if (this.type === Type.Node && this.ws instanceof nodeWs.ws) {
            switch (eventName) {
                case 'open':
                    this.ws.on('open', () => callback());
                    break;
                case 'message':
                    this.ws.on('message', (data: any) => callback(data));
                    break;
                case 'close':
                    this.ws.on('close', (code: number, reason: string) => callback({ code, reason }));
                    break;
                case 'error':
                    this.ws.on('error', (data: any) => callback(data));
                    break;
                default:
                    throw (`Invalid event name ${eventName}`);
            }
        }
    }

    public send(message: string) {
        if (this.type === Type.Browser && this.ws instanceof WebSocket) {
            this.ws.send(message);
        } else if (this.type === Type.Node && this.ws instanceof nodeWs.ws) {
            this.ws.send(message);
        }
    }

    public close(code: number = 1000, reason: string = '') {
        if (this.type === Type.Browser && this.ws instanceof WebSocket) {
            this.ws.close(code, reason);
        } else if (this.type === Type.Node && this.ws instanceof nodeWs.ws) {
            this.ws.close(code, reason);
        }
    }

    public getReadyState() {
        if (this.type === Type.Browser && this.ws instanceof WebSocket) {
            return ReadyState[this.ws.readyState];
        } else if (this.type === Type.Node && this.ws instanceof nodeWs.ws) {
            return ReadyState[this.ws.readyState];
        }
    }

}