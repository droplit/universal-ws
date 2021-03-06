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

    public static close(connection: WebSocket, code: StatusCode | number, message?: string) {
        if (message !== undefined) {
            // message must be a string if specified, otherwise the client will not properly recieve the close event 
            return connection.close(code, message.toString());
        }
        else
            connection.close(code);
    }
}