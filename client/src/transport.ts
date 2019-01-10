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

export enum StatusCode {
    Normal_Closure = 1000,
    Going_Away,
    Protocol_Error,
    Unexpected_Data,
    Invalid_Data = 1007,
    Message_Error,
    Message_Too_Large,
    Unexpected_Error = 1011
}

export class UniversalWs {
    private ws?: import('ws') | WebSocket;

    public async constructTransport(host: string, options?: any) {
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
        if (typeof WebSocket !== 'undefined') {
            this.ws = new WebSocket(host);
            return;
        }

        const ws = await import('ws');
        if (ws) {
            console.log('WS SUCCESSFULLY IMPORTED AND NOW SETTING TO this.ws');
            this.ws = new ws(host, options);
            return;
        }

        throw new Error('Cannot construct WebSocket! Your environment may not support web sockets. See: https://caniuse.com/#feat=websockets');
    }

    public on(eventName: 'open' | 'message' | 'close' | 'error', callback: any) {
        if (!this.ws) return;
        console.log('WS EXISTS');
        if (isBrowser(this.ws)) {
            switch (eventName) {
                case 'open':
                    this.ws.addEventListener('open', (event: Event) => callback(event));
                    break;
                case 'message':
                    this.ws.addEventListener('message', (event: MessageEvent) => {
                        // console.log('rx:', event.data)
                        callback(event.data);
                    });
                    break;
                case 'close':
                    this.ws.addEventListener('close', (event: CloseEvent) => callback({ code: event.code, reason: event.reason }));
                    break;
                case 'error':
                    this.ws.addEventListener('error', (event: Event) => callback(event));
                    break;
                default:
                    throw (`Invalid event name ${eventName}`);
            }
        } else {
            console.log('NODE WS SUBBING TO:', eventName);
            switch (eventName) {
                case 'open':
                    this.ws.on('open', () => { console.log('CLIENT IS OPEN NOW'); callback(); });
                    break;
                case 'message':
                    this.ws.on('message', (data: import('ws').Data) => callback(data));
                    break;
                case 'close':
                    this.ws.on('close', (code: number, reason: string) => callback({ code, reason }));
                    break;
                case 'error':
                    this.ws.on('error', (error: Error) => callback(error));
                    break;
                default:
                    throw (`Invalid event name ${eventName}`);
            }
        }
    }

    public send(message: string) {
        // console.log('tx:', message)
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            this.ws.send(message);
        } else {
            this.ws.send(message);
        }
    }

    public close(code: number = 1000, reason: string = '') {
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            this.ws.close(code, reason);
        } else {
            this.ws.close(code, reason);
        }
    }

    public getReadyState() {
        if (!this.ws) return;
        if (isBrowser(this.ws)) {
            return ReadyState[this.ws.readyState];
        } else {
            return ReadyState[this.ws.readyState];
        }
    }
}

function isBrowser(ws: import('ws') | WebSocket): ws is WebSocket {
    return !!WebSocket && ws instanceof WebSocket;
}