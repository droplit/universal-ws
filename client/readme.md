[![NPM](https://nodei.co/npm/universal-ws.png)](https://www.npmjs.com/package/universal-ws)

![node](https://img.shields.io/github/license/droplit/universal-ws.svg?style=flat-square)

# Universal WebSocket Client

An isomorphic transport layer library for both node and browsers. Built on [ws](https://github.com/websockets/ws) and native browser [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) implementations. Works best with the server counterpart [Universal WebSocket Server](https://www.npmjs.com/package/universal-ws-server).


### Attributes

In addition to standard websocket features, `universal-ws` provides:

* Send and receive messages and data.
* Make and handle request/response like operations to the server.
* Configurable authentication.
* Periodic heartbeats check if the client is connected.
* Add or remove individual handlers for when a connection is established or closed and when receiving messages or requests.

## Theory of Operation

As a client attempts to connect to the server, the server has the option to authenticate the client to establish the connection. Once connected, the server may send messages/data and make requests to the client. The client may also do the same with the server. The server will handle these requests and also check if the client successfully received the response. Both the server and the client may close the connection at any time.

## Terminology

**Message** - Any string sent and received. May include additional data.

**Request** - A message that expects a response with data.

**Response** - Data sent back when a request is made.

**Acknowledgement** - Message sent back when the response was received.

**Heartbeat** - Message sent periodically to check connection status.

## Getting Started

### Installation

```shell
npm install universal-ws
```
### Client Setup

```js
import { UniversalWebSocket } from 'universal-ws';
const HOST = 'wss://my.api'
const uws = new UniversalWebSocket(HOST);
uws.on('connected', () => {
    console.log('Connected!');
});
uws.on('close', () => {
    console.log('Closed!');
});
```

### Events

* `'connected'` - Emitted when the client connects to the server.
* `'close'` - Emitted when the client connection to the server is closed.
* `'error'` - Any error that occurs.
* `message` - A named string, sent from the server.

## Advanced Options

```ts
import { UniversalWebSocket } from 'universal-ws';
const HOST = 'wss://my.api'
const options: ConnectionOptions = { ... };
const uws = new UniversalWebSocket(HOST, options);
```

The client can be constructed with the following options: 
```ts
export interface ConnectionOptions {
    connectionTimeout?: number;
    responseTimeout?: number;
    heatbeatInterval?: number;
    heartbeatMode?: HeartbeatMode;
    heartbeatModeTimeoutMultiplier?: number | (() => number);
    autoConnect?: boolean;
    perMessageDeflateOptions?: PerMessageDeflateOptions;
    retryOptions?: retry.OperationOptions;
    retryConnectionStatusCodes?: number[];
}
```

The `retryOptions` parameter are all options available to [retry](https://www.npmjs.com/package/retry);

## Authentication


To pass any authentication parameters, such as a username + password, token, or others. The server will have access to these parameters as an array. 

> Parameters must be strings. If you wish to pass an object or a number, it must be stringified; then parsed on the server side.

```ts
const uws = new UniversalWebSocket(HOST, options, ...parameters);
```

Example: 

```ts
import { UniversalWebSocket } from 'universal-ws';
const HOST = 'wss://my.api'
const username = 'myUsername';
const password = 'myPassword123!@#';
const uws = new UniversalWebSocket(HOST, {}, username, password);
```

Server side:

```js
WebSocketServer.on('connected', client => {
    const [username, password] = client.parameters;
    ...
});
```


> Under the hood, `universal-ws` uses the Subprotocol header (`Sec-WebSocket-Protocol`). Values are reduced with a delimeter and then [base58](https://en.wikipedia.org/wiki/Base58) encoded to avoid any special header characters. The reverse operations are applied server side. 