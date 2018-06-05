import { EventEmitter } from 'events';
import * as http from 'http';
import * as WebSocket from 'ws';

// interface StandardPacket {
//     t?: 'hb' | 'hbr' | undefined; // heartbeat, heartbeat response, standard message
//     m: string;
//     d: any;
//     i: string; // Message Id: from the client, assigned from 1 to MAX_SAFE_INTEGER
//     r?: string | boolean;
// }

// interface RequestPacket {
//     m: string;
//     d: any;
//     i: string;
//     r: boolean; // Reponse expected when true
// }

// interface ResponsePacket {
//     d: boolean[];
//     r: string; // original Message Id
// }

// interface HeartbeatPacket {
//     t: 'hb' | 'hbr';
// }

// interface SentMessageMapItem {
//     channel: string;
//     response(channel: string, data: ResponsePacket): void;
// }

// enum StatusCode {
//     Normal_Closure = 1000,
//     Going_Away,
//     Protocol_Error,
//     Unexpected_Data,
//     Invalid_Data = 1007,
//     Message_Error,
//     Message_Too_Large,
//     Unexpected_Error = 1011
// }

export class Transport extends EventEmitter {

    // private readonly CONNECTION_DIGEST_INTERVAL = 1000;
    // private readonly CONNECTION_INACTIVE_TIMEOUT = 20000;
    private wss: WebSocket.Server;

    constructor(server: http.Server) {
        super();
        this.wss = new WebSocket.Server({ server });

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