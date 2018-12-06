import { EventEmitter } from 'events';
import { Server } from 'http';
import * as WebSocket from 'ws';

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

        this.wss.on('connection', (connection, request) => {
            this.emit('connection', connection, request);

            connection.on('message', (data) => {
                this.emit('message', connection, data);
            });

            connection.on('close', (code, message) => {
                this.emit('close', connection, code, message);
            });
        });
    }

    public send(connection: WebSocket, message: string, callback?: (error: Error) => void | undefined) {
        // connection.send(message, callback);
        connection.send(message, (error) => {
            if (error) {
                this.emit('close', connection);
            }
        });
    }

    public close(connection: WebSocket, code: StatusCode, message?: string) {
        connection.close(code, message);
    }
}