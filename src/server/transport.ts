import { EventEmitter } from 'events';
import * as debug from 'debug';
import * as retry from 'retry';
import * as WebSocket from 'ws';

const log = debug('droplit:transport2');

interface StandardPacket {
    t?: 'hb' | 'hbr' | undefined; // heartbeat, heartbeat response, standard message
    m: string;
    d: any;
    i: string; // Message Id: from the client, assigned from 1 to MAX_SAFE_INTEGER
    r?: string | boolean;
}

interface RequestPacket {
    m: string;
    d: any;
    i: string;
    r: boolean; // Reponse expected when true
}

interface ResponsePacket {
    d: boolean[];
    r: string; // original Message Id
}

interface HeartbeatPacket {
    t: 'hb' | 'hbr';
}

interface SentMessageMapItem {
    channel: string;
    response(channel: string, data: ResponsePacket): void;
}

export class Transport extends EventEmitter {

    private readonly CONNECTION_DIGEST_INTERVAL = 1000;
    private readonly CONNECTION_INACTIVE_TIMEOUT = 20000;

    constructor() {
        super();
        // const
    }
}