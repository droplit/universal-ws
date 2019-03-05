<p align="center">
  <a href="https://github.com/droplit/universal-ws">
    <img height="400" width="400" src="https://raw.githubusercontent.com/droplit/universal-ws/master/UniversalWSLogo.svg?sanitize=true">
  </a>
</p>

<a href="https://droplit.io">
    <img height="70" width="280" src="https://raw.githubusercontent.com/droplit/content/master/createdByDroplitBanner-worqr100x400.png" target="_blank">
</a>

[![NPM](https://nodei.co/npm/universal-ws.png)](https://www.npmjs.com/package/universal-ws)

![node](https://img.shields.io/github/license/droplit/universal-ws.svg?style=flat-square)

# Universal WebSocket Client

An isomorphic WebSocket library for both node and browsers. Built on [ws](https://github.com/websockets/ws) and native browser [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) implementations. Works best with the server counterpart [Universal WebSocket Server](https://www.npmjs.com/package/universal-ws-server).

## Attributes

In addition to standard websocket features, `universal-ws` can:

* Send and receive messages with data and optionally expect aknowledgement from the server.
* Make and handle request/response-like operations to the server.
* Authenticate when connecting to the server.
* Send and receive periodic heartbeats to check if the client is connected.
* Negotiate with the server to configure heartbeats.
* Reconnect automatically if the client is disconnected unexpectedly.
* Add or remove individual handlers for when a connection is established or closed and when receiving messages or requests.

## Theory of Operation

As a client attempts to connect to the server, the server has the option to authenticate the client to establish the connection. Once connected, the server may send messages/data and make requests to the client. The client may also do the same with the server. The server will handle these requests and also check if the client successfully received the response. Both the server and the client may close the connection at any time.

## Terminology

**Message** - Any string sent and received. May include additional data.

**Request** - A message (with optional data) that expects a response with data.

**Response** - Data sent back when a request is made.

**Acknowledgement** - Message sent back to confirm that the response was received.

**Heartbeat** - Message sent periodically to check the connection status.

## Getting Started

### Installation

```shell
npm install universal-ws
```

### Client Setup

```js
import { UniversalWebSocket } from 'universal-ws';
const PORT = 3002;
const HOST = `wss://localhost:${PORT}`;

// Connect when instantiating (unless ConnectionOptions.autoConnect is false)
const uws = new UniversalWebSocket(HOST);
```

## Events

The client can handle the following events:

**connected** - Emitted when the client connects to the server.

**disconnected** - Emitted when the client connection to the server is closed.

**error** - Any error that occurs.

**state** - Emitted when the connection status changes.

**#MESSAGE** - A message (with optional data) sent from the server.

**@REQUEST** - A request (with optional data) sent from the server, which expects a response via callback.

> Note: To differentiate between **MESSAGE** and **REQUEST** in event names, `#` and `@` is prefixed to **MESSAGE** and **REQUEST**, respectively.

Examples:

```ts
uws.on('connected', () => {
    console.log('Connected!');
});
uws.on('disconnected', (code?: StatusCode, reason?: string) => {
    console.log('Disconnected!');
    console.log('Status:', code);
    console.log('Reason:', reason);
});
uws.on('state', (state: State) => {
    console.log('WebSocket connection state has changed to:', state);
});
uws.on('error', (error: Error | any) => {
    console.log('Encountered an error:', error);
});
uws.on('#Yo', (data?: any) => {
    console.log('Yo, got a message about', data);
});
uws.on('@Show me your wallet.', (data: { amount: number }, callback: (data: any, ack?: boolean) => void | Promise<void>) => {
    const funds = 0;
    console.log('The server is asking for money, we have', funds, 'out of', data.amount);
    callback(funds);
});
```

## Connection Options

The client can be constructed with additional options

```ts
import { UniversalWebSocket } from 'universal-ws';
const PORT = 3002;
const HOST = `wss://localhost:${PORT}`;
const options: ConnectionOptions = { ... };
const uws = new UniversalWebSocket(HOST, options);
```

The client can be constructed with the following options:

* **connectionTimeout** - `60` - Time in seconds before an attempt to connect times out.
* **responseTimeout** - `15` - Time in seconds before a request to the server times out.
* **heartbeatInterval** - `1` - Time in seconds between heartbeats to the server.
* **heartbeatMode** - `HeartbeatMode.roundtrip` - Heartbeats made to the server (upstream), from the server (downstream), roundtrip (both), or disabled (neither).
* **heartbeatTimeoutMultiplier** - `2.5` - Multiplier applied to the timeout when heartbeats are not received. This can be a number or a function that returns a number.
* **autoConnect** - `true` - If set to false, `universal-ws` will not connect to the server without calling `UniversalWebSocket.open()`. If the server disconnects under certain conditions, `universal-ws` will attempt to reconnect to the server automatically.
* **perMessageDeflateOptions** - `true | {}` - Supported for NodeJS applications only. See npm package [ws](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) for available options. Uses the [WebSocket Per-message Deflate](https://tools.ietf.org/html/draft-ietf-hybi-permessage-compression-19) Extension.
* **retryOptions** - `{ factor: 1.5, minTimeout: 500, maxTimeout: 60000, randomize: true, forever: true }` - Retry configuration for attempting to connect to the server. See npm package [retry](https://www.npmjs.com/package/retry) for more information.
* **retryConnectionStatusCodes** - `[]` - Custom disconnected status codes that warrant retrying attempts to connect to the server if `UniversalWebSocket.autoConnect` is true.

## Authentication

To pass any authentication parameters, such as a username + password, token, or others upon connection. The server will have access to these parameters as an array.

> Parameters must be strings. If you wish to pass an object or a number, it must be stringified; then parsed on the server side.

Example:

```ts
import { UniversalWebSocket } from 'universal-ws';
const PORT = 3002;
const HOST = `wss://localhost:${PORT}`;
const username = 'aVeryUniqueName';
const password = 'aPasswordSoSecure,itHasNo#sAndContains*';
const uws = new UniversalWebSocket(HOST, {}, username, password);
```

Server side:

```js
WebSocketServer.on('connected', client => {
    const [username, password] = client.parameters;
    ...
});
```

> Under the hood, `universal-ws` uses the Subprotocol header (`Sec-WebSocket-Protocol`). Values are reduced with a delimiter and then [base58](https://en.wikipedia.org/wiki/Base58) encoded to avoid any special header characters. The reverse operations are applied server side.

## Properties

* **state** - `connecting` | `open` | `closing` | `closed` - Readonly value of the current connection status.
* **heartbeatMode** - `upstream` | `downstream` | `roundtrip` | `disabled` - Readonly value of the current configured heartbeat mode. Also configured in **ConnectionOptions**
* **heartbeatInterval** - `number` - Time in seconds between heartbeats. Also configured in **ConnectionOptions**.
* **responseTimeout** - `number` - Time in seconds until a response times out. Also configured in **ConnectionOptions**.

## Methods

### **open**() - Connect to the server

```ts
uws.open();
```

### **close**(code: StatusCode = StatusCode.Normal_Closure, reason?: string) - Disconnect from the server

```ts
uws.close(StatusCode.Normal_Closure, 'Closing up shop for the day.');
```

### **send**(message: string, data?: any) - Send a message with data to the server

```ts
uws.send('action', { headlights: 'Low-Beams' });
```

### **sendWithAck**(message: string, data?: any) - Send a message with data to the server expecting an acknowledgement

```ts
uws.sendWithAck('action', { brakes: { location: 'front-left', strength: 75, hold: true, easeIn: false } }).then(() => {
    console.log('Server successfully received the message "action"');
}).catch(error => {
    console.log('Server failed to receive the message "action"');
});
```

### **request**(message: string, data?: any) - Send a request with data to the server expecting a response

```ts
uws.request('air conditioner', { side: 'passenger' }).then((response: { success: boolean, reason?: string }) => {
    console.log('Server responded with:', response);
}).catch(error => {
    console.log('Server failed to respond to request in time');
});
```

### **negotiate**(settings: { heartbeatMode?: HeartbeatMode, heartbeatInterval?: number }) - Negotiate with the server to agree to a heartbeat configuration

```ts
uws.negotiate({ heartbeatMode: HeartbeatMode.downstream, heartbeatInterval: 10000 }).then({ approve, supportedOptions } => {
    if (approve) {
        console.log('Server accepted the terms provided');
    } else {
        console.log('Server rejected the terms provided');
        const { heartbeatMode, minHeartbeatInterval, maxHeartbeatInterval } = supportedOptions;

        console.log('Server provided the following terms:');
        console.log('heartbeatMode:', heartbeatMode);
        console.log('minHeartbeatInterval:', minHeartbeatInterval);
        console.log('maxHeartbeatInterval:', maxHeartbeatInterval);
    }
}).catch(error => {
    // Server may fail to respond and the negotiation times out
    console.log('Encountered an error:', error);
});
```
