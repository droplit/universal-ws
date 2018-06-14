import { EventEmitter } from 'events';
import { Server } from 'http';
import * as WebSocket from 'ws';

export class Transport extends EventEmitter {
    private wss: WebSocket.Server;

    constructor(server: Server, perMessageDeflate: WebSocket.PerMessageDeflateOptions = { threshold: 1024 }) {
        super();
        if (perMessageDeflate) {
            this.wss = new WebSocket.Server({
                server,
                perMessageDeflate
            });
        } else {
            this.wss = new WebSocket.Server({ server });
        }

        this.wss.on('connection', (connection: WebSocket) => {
            this.emit('connection', connection);

            connection.on('message', (data) => {
                this.emit('message', connection, data);
            });

            connection.on('close', (code, message) => {
                this.emit('close', connection, code, message);
            });
        });
    }

    public send(connection: WebSocket, message: string, callback: (error: Error) => void | undefined) {
        connection.send(message, callback);
    }
}