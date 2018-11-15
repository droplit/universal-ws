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

## Theory of Operation

As a client attempts to connect to the server, the server has the option to authenticate the client to establish the connection. Once connected, the server may send messages/data and make requests to the client. The client may also do the same with the server. The server will handle these requests and also check if the client successfully received the response. Both the server and the client may close the connection at any time.

Note: During authentication process, the client may operate as usual to exchange data with the server such as with responding to requests from the server to provide details.

## Terminology

**Message** - Any string sent and received. May include additional data.
**Request** - A message that expects a response with data.
**Response** - Data sent back when a request is made.
**Acknowledgement** - Message sent back.
**Heartbeat** - .

## Installation
```
npm install universal-ws-server
```

## Example
```js
import * as http from 'http';
import { Access, StatusCode, PerMessageDeflateOptions, WsContext } from 'universal-ws-server';

const httpServer = http.createServer();
const WebSocketServer = new Access(httpServer);

WebSocketServer.on('connected', (connection: WsContext) => {
    console.log('Successfully connected to a client!');
});

WebSocketServer.onMessage('hello', (clientId, data, context) => {
    console.log('Received a hello!');
});

```

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

