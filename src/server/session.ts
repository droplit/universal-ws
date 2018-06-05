import { EventEmitter } from 'events';
import * as http from 'http';
import { Transport } from './transport';
import * as WebSocket from 'ws';

export interface WsContext<Context = any> extends WebSocket {
    context: Context;
    lastHeartbeat: Date;
    waiting: (() => void)[];
}

export interface StandardPacket {
    t?: 'hb' | 'hbr';
    m: string;
    d: any;
    r?: boolean;
    i: string;
}

export class Session extends EventEmitter {

    private transport: Transport;
    public connections: WebSocket[] = [];

    constructor(server: http.Server, authenticator?: (connection: WsContext) => boolean) {
        super();
        this.transport = new Transport(server);

        this.transport.on('connection', (connection: WsContext) => {
            if (authenticator) {
                if (authenticator(connection)) {
                    this.onConnectionActive(connection);
                    this.connectionReady(connection);
                    this.renewHeartbeat(connection);
                    this.connections.push(connection);
                } else {
                    connection.close(1008, JSON.stringify({ code: 1008, reason: 'auth' }));
                }
            } else {
                // No need to authenticate
                this.renewHeartbeat(connection);
                this.connections.push(connection);
            }

            connection.on('message', (data) => {
                this.onMessage(connection, data);
            });
        });
    }

    private awaitReady(connection: WsContext, callback: () => void) {
        if (connection.context) {
            process.nextTick(callback);
        } else {
            connection.waiting = connection.waiting || [];
            connection.waiting.push(callback);
        }
    }

    private connectionReady(connection: WsContext) {
        if (connection.waiting) {
            connection.waiting.forEach((callback) => {
                process.nextTick(callback);
            });
            delete connection.waiting;
        }
    }

    private onConnectionActive(connection: WsContext) {
        if (!connection.context) {
            return;
        } else {
            this.renewHeartbeat(connection);
        }
    }

    private renewHeartbeat(connection: WsContext) {
        connection.lastHeartbeat = new Date();
    }

    private onMessage(connection: WsContext, message: any) {
        this.onConnectionActive(connection);

        // Empty message
        if (!message) {
            return;
        }

        // Binary message
        if (Buffer.isBuffer(message)) {
            return;
        }

        this.awaitReady(connection, () => {
            let packet: StandardPacket;

            // parse packet JSON
            try {
                packet = JSON.parse(message);
            } catch (error) {
                // throw?
                throw new Error('Invalid packet');
            }

            // Handle Heartbeat is this necessary due to above onConnection
            if (packet.t === 'hb') {
                this.renewHeartbeat(connection);
            } else if (packet.t === 'hbr') {
                // Send connection a heartbeat response?
                this.renewHeartbeat(connection);
            }

            if (packet.r === undefined) {
                // Handle message
                this.emit(`${packet.m}`, packet.i, packet.d, connection.context, (result: any) => {
                    // Done
                });
            } else if (packet.r === true) {
                // Handle request expecting a response
                this.emit(`${packet.m}`, packet.i, packet.d, connection.context, (result: any) => {
                    const response = {
                        d: result,
                        r: JSON.stringify(packet.i)
                    };

                    connection.send(JSON.stringify(response));
                });
            }
        });
    }

}