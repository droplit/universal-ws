[![NPM](https://nodei.co/npm/universal-ws-server.png)](https://www.npmjs.com/package/universal-ws-server)

![node](https://img.shields.io/github/license/droplit/universal-ws.svg?style=flat-square)

# Universal WebSocket Server

A WebSocket Server with Remote Procedure Call architecture. Works best with the client counterpart [Universal WebSocket](https://www.npmjs.com/package/universal-ws).

## Attributes

In addition to standard websocket features, `universal-ws-server` can:

* Send and receive messages with data and optionally expect aknowledgement from the client.
* Store context for each individual client.
* Authenticate clients upon connection.
* Make and handle request/response-like operations with a client.
* Ensure the client received the response to its request.
* Send and receive periodic heartbeats to check if the client is connected.
* Compress data with the [WebSocket Per-Message Compression Extension](https://tools.ietf.org/html/rfc7692).
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
npm install universal-ws-server
```

### Server Setup

```js
import * as http from 'http';
import { UniversalWebSocketServer, Client } from 'universal-ws-server';

interface Context {
    displayName: string;
}

const httpServer = http.createServer();
const uwsServer = new UniversalWebSocketServer<Context>(httpServer);
```

## Events

The server can handle the following events:

**connected** - Emitted when a client connects to the server.

**disconnected** - Emitted when a client's connection to the server is closed.

**#MESSAGE** - A message (with optional data) sent from a client.

**@REQUEST** - A request (with optional data) sent from a client, which expects a response via callabck.

> Note: To differentiate between **MESSAGE** and **REQUEST** in event names, `#` and `@` is prefixed to **MESSAGE** and **REQUEST**, respectively.

Examples:

```ts
uwsServer.on('connected', (client: Client<Context>) => {
    console.log('A client has connected to the server');
});
uwsServer.on('disconnected', (client: Client<Context>) => {
    console.log('A client has disconnected from the server');
});
uwsServer.on('#action', (client: Client<Context>, data: { headlights: 'Low-Beams' | 'High Beams' }) => {
    console.log('A client wants to toggle the', data.headlights);
});
uwsServer.on('@air conditioner', (client: Client<Context>, data: { side: 'driver' | 'passenger' }) => {
    console.log(`A client wants to know about the ${data.side}-side air conditioner settings`);
});
```

## Advanced Options

The server can be constructed with additional options

```ts
import * as http from 'http';
import { UniversalWebSocketServer, Client, Options } from 'universal-ws-server';

interface Context {
    displayName: string;
}

const options: Options = { ... };

const httpServer = http.createServer();
const uwsServer = new UniversalWebSocketServer<Context>(httpServer, options);
```

The server can be constructed with the following options:

* **defaultHeartbeatMode** - `HeartbeatMode.roundtrip` - Heartbeats made to the client (downstream), from the client (upstream), roundtrip (both), or disabled (neither).
* **defaultHeartbeatInterval** - `1` - Time in seconds between heartbeats to the client.
* **heartbeatTimeoutMultiplier** - `2.5` - Multiplier applied to the timeout when heartbeats are not received. This can be a number or a function that returns a number.
* **supportedOptions** - `{ heartbeatModes?: Set<HeartbeatMode> | HeartbeatMode[], minHeartbeatInterval?: number, maxHeartbeatInterval?: number, perMessageDeflateOptions: PerMessageDeflateOptions | true }` - Support for clients with varying settings with heartbeatModes and heartbeatIntervals. Also configure the [WebSocket Per-message Deflate](https://tools.ietf.org/html/draft-ietf-hybi-permessage-compression-19) Extension options. See npm package [ws](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) for available options.

## Authentication

Clients will provide authentication parameters upon connection to the server. Parameters can be a username and password, token, or any other valid string(s).

> Parameters must be strings. If clients must send parameters that are numbers or objects, it will be stringified and must be parsed by the server.

Example:

```ts
uwsServer.on('connected', (client: Client<Context>) => {
    console.log('A client has connected to the server');
    const [username, password] = client.parameters;
    if (!username || !password) {
        console.log('This client is not authenticated');
    } else {
        console.log('Username:', client.parameters[0]);
        console.log('Password:', client.parameters[1]);
    }
});
```

> Under the hood, `universal-ws` uses the Subprotocol header (`Sec-WebSocket-Protocol`). Values are reduced with a delimiter and then [base58](https://en.wikipedia.org/wiki/Base58) encoded to avoid any special header characters. The reverse operations are applied server side.

## Properties

* **clients** - `Client[]` - List of clients connected to the server.

## Methods

### **send**(client: Client, message: string, data?: any) - Send a message with data to the client

```ts
uwsServer.send(client, 'Yo', 'Some stuff, yo');
```

### **sendWithAck**(client: Client, message: string, data?: any) - Send a message with data to the client expecting an acknowledgement

```ts
uwsServer.sendWithAck(client, 'alert', { location: 'front', distance: 15, type: 'vehicle_collision' }).then(() => {
    console.log('Client successfully received the message "alert"');
}).catch(error => {
    console.log('Client failed to receive the message "alert"');
});
```

### **request**(client: Client, message: string, data?: any) - Send a request with data to the client expecting a response

```ts
uwsServer.request(client, 'Send keys', { time: new Date() }).then((response: string) => {
    console.log('Client responded with:', response);
}).catch(error => {
    console.log('Client failed to respond to request in time');
});
```

### **close**(client: Client, code: StatusCode = StatusCode.Normal_Closure, reason?: string) - Disconnect from the client

```ts
uwsServer.close(client, StatusCode.Normal_Closure, 'ECU turning off');
```

## Client

Each client connected to the server is an instance of Client with its own properties and methods for interaction.

### Client Properties

* **context** - `Context` | `undefined` - Defined by the generic Context type on the server, the **context** property can be any other information relevant to each client.
* **lastHeartbeat** - `Date` - The Date of the last heartbeat received from the client.
* **parameters** - `string[]` - Authentication parameters sent by the client upon connection.
* **state** - `open` | `closed` - The connection state of the client.

### Client Methods

### **send**(message: string, data?: any) - Send a message with data to the client

```ts
client.send('Infotainment', { music: { action: 'track_changed' } });
```

### **sendWithAck**(message: string, data?: any) - Send a message with data to the client expecting an acknowledgement

```ts
client.sendWithAck('warning', { location: 'speedometer', type: 'over_limit' }).then(() => {
    console.log('Client successfully received the message "warning"');
}).catch(error => {
    console.log('Client failed to receive the message "warning"');
});
```

### **request**(message: string, data?: any) - Send a request with data to the client expecting a response

```ts
client.request('seatbelt', { locations: ['driver', 'passenger'] }).then((response: boolean[]) => {
    console.log('Client responded with:', response);
}).catch(error => {
    console.log('Client failed to respond to request in time');
});
```

### **close**(code: StatusCode = StatusCode.Normal_Closure, reason?: string) - Disconnect from the client

```ts
client.close(StatusCode.Invalid_Data, 'Invalid key info');
```