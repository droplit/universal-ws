[![NPM](https://nodei.co/npm/universal-ws-server.png)](https://www.npmjs.com/package/universal-ws-server)

![node](https://img.shields.io/github/license/droplit/universal-ws.svg?style=flat-square)

# Universal WebSocket Server

A WebSocket Server with Remote Procedure Call architecture. Works best with the client counterpart [Universal WebSocket](https://www.npmjs.com/package/universal-ws).

Attributes:

* Send and receive messages and data.
* Store context for each individual client.
* Make and handle requests.
* Ensure the client received the response to its request.
* Periodic heartbeats check if the client is connected and responsive.
* Compress data with the [WebSocket Per-Message Compression Extension](https://tools.ietf.org/html/rfc7692).
* Authenticate clients on or after connection.
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
import { UniversalWebSocketServer, Options, Context, StatusCode } from 'universal-ws-server';

interface ClientContext {
    identity: string;
}

const httpServer = http.createServer();
const WebSocketServer = new UniversalWebSocketServer<ClientContext>(httpServer);

WebSocketServer.on('connected', (connection) => {
  console.log('Successfully connected to a client!');
});
```

### Authenticating

In this example the client is created with two parameters, `username` and `password`;

```js
import * as http from 'http';
import { UniversalWebSocketServer, Options, Context, StatusCode } from 'universal-ws-server';

enum CustomWebsocketStatusCodes {
    FailedToAuthenticate = 4000
}

const httpServer = http.createServer();
const WebSocketServer = new UniversalWebSocketServer(httpServer);

const connectedClients = [];
WebSocketServer.on('connected', client => {
    if (!client.parameters && client.parameters.length == 2) return client.close(CustomWebsocketStatusCodes.FailedToAuthenticate, 'Missing required parameters');
        const [username, password] = client.parameters;
        authenticateToken(username, password).then((authenticated: boolean) => {
            if (authenticated) {
                connectedClients.push(client);
            } else {
                client.close(CustomWebsocketStatusCodes.FailedToAuthenticate, 'Invalid credentials');
            }
        }).catch((error: string) => {
            client.close(CustomWebsocketStatusCodes.FailedToAuthenticate, error);
        });
});

function authenticate(username:string, password: string) {
    return new Promise(...)
}
```



### Client connects and disconnects

```js
// Handle clients when connected to the server
WebSocketServer.on('connected', (connection: WsContext) => {
    console.log('Successfully connected to a client!');
});

// Handle clients that have disconnected from the server
WebSocketServer.on('close', (connection: WsContext) => {
  console.log('Client no longer connected!');
});
```

### Disconnect from a client

```js
// Client sends a message to set their identity or attempt to ruin a database
WebSocketServer.onMessage('Hi, my name is', (connection, data: string, context) => {
    if (data !== 'DROP TABLE CLIENTS;') {
        context.identity = data;
        console.log('Client identity set:', data);
    } else {
        // Close the undesired connection
        WebSocketServer.close(connection);
    }
});
```

### Send a message to a client

```js
// Message clients when they connect to the server
console.log('Sending a friendly message...');
WebSocketServer.sendMessage(connection, 'Welcome!');
```

### Handle a message from a client

```js
// Client sends a message with their identity
WebSocketServer.onMessage('Hi, my name is', (connection, data: string, context) => {
    context.identity = data;
    console.log('Client identity set:', data);
});
```

### Make a request to a client

```js
const connections: Context<ClientContext>[] = [];

/**
 * Client connects and is pushed to connections list
 */

// Request information from the client with additional data
WebSocketServer.makeRequest(connections[0], 'What is your name?', { includeFirst: true, includeLast: true }, (response: { first: string, last: string }, error) => {
    if (!error) {
        // Use client's response optional data
        connections[0].context.identity = `${response.first} ${response.last}`;
    } else {
        // Request timed out
        console.log('Failed to make request');
    }
});
```

### Handle a request from a client

```js
const status: string = 'Initializing';

/**
 * Some stuff happens
 */

status = 'Running';

// Request information from the client with additional data
WebSocketServer.onRequest('Is this your state?', (connection, data: { state: string }, context, callback: (result, onAcknowledge, acknowledgementTimeout)) => {
    // respond to the request with some result
    callback(data.state === status);
});
```

### Handle a request from a client and expect the client to acknowledge the response

```js
const status: string = 'Initializing';

/**
 * Some stuff happens
 */

status = 'Running';

// Request information from the client with additional data
WebSocketServer.onRequest('Is this your state?', (connection, data: { state: string }, context, callback: (result, onAcknowledge?: (response: any, error?: Error) => void, acknowledgementTimeout?: number)) => {
    // respond to the request with some result
    // Acknowledgement callback returns when client acknowledges reception of the response before the timeout (in miliseconds)
    callback(data.state === status, (response: any, error?: Error) => {
        if (!error) {
            console.log('Client received the response and acknowledged it');
        } else {
            console.log('Client failed to acknowledge the response or the response failed to reach the client');
        }
    }, 10000);
});
```

## Advanced Options

### Poll Rate

How often the heartbeat will 

### Timeout

Value: 60000ms or `{ minimum, maximum }`

The maximum time(ms) which a client can miss heartbeats until the client is considered to be disconnected. If setting as a range, the minimum and maximum must be greater than the minimum and maximum of pollRate, respectively. UniversalWebSocket.onDisconnnected(callback) will be called with the connection when this occurs.

### Conserve Bandwidth

### Per-Message Deflate

## Example

### Handle events:
* `connection` - Connection attempt.
* `connected` - Successful connections.
* `close` - Connnection closed.

### Send:
* `Message`: _string_
  * `connection`: _WsContext_ - connection object used for:
    * messages
    * requests
    * closing connections
  * `data`: _any_ - optional data.
* `Request`: _string_ - RPC interaction with a client.
  * `connection`: _WsContext_ - connection object used for:
    * messages
    * requests
    * closing connections
  * `data`: _any_ - optional data.

### Receive:
* `Message`: _string_
  * `clientId`: _string_ - optional identifier.
  * `data`: _any_ - optional.
  * context: _Context_ - data optionally used and maintained by server per connection.
* `Request`: _string_ - RPC interaction initiated by a client.
  * `clientId`: _string_ - optional identifier.
  * `data`: _any_ - optional.
  * `context`: _Context_ - data optionally used and maintained by server per connection.
  * `callback`: _Function_ - respond to request via provided function.
    * `result`: _any_ - data to respond to request with.
    * `timeout`: _number_ - milliseconds to timeout for client to acknowledge response if acknowledge callback is provided.
    * `onAcknowledge`: _Function_ - receive confirmation that client received response.
      * `response`: _any_ - optional.
      * `error`: _any_ - optional.

### Close:
* `Connection`: _WsContext_ - connection object used for:
  * messages
  * requests
  * closing connections
* `code`: _StatusCode_ - reason for closing connection defined by [RFC #6455](https://tools.ietf.org/html/rfc6455#section-7.4).
* `reason`: _string_ - additional reason for closing client connection.

## Under The Hood:
* Heartbeat - Server polls the client to maintain the connection to reduce data loss.
  * `pollRate`: _number_|_object_ - adjustable rate at which heartbeat requests are sent to client.
    * `minimum`: _number_ - lowest interval in milliseconds.
    * `maximum`: _number_ - highest interval in milliseconds.
  * `timeout`: _number_|_object_ - adjustable rate at which inactive connections timeout.
    * `minimum`: _number_ - lowest interval in milliseconds.
    * `maximum`: _number_ - highest interval in milliseconds.
  * `conserveBandwidth`: _boolean_ - reduce pollRate and maximize timeout for low-bandwidth.
* Compression - reduce data sent over WebSocket defined by [ws](https://github.com/websockets/ws#websocket-compression)

