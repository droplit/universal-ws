# Universal-WS

## Server
### Install
`npm install universal-ws-server`

### Example
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

### Features
Handle events:
* `connection` - Connection attempt
* `connected` - Successful connections
* `close` - Connnection closed

Send:
* `Message`: _string_
  * `connection`: _WsContext_ - connection object used for:
    * messages
    * requests
    * closing connections
  * `data`: _any_ - optional data
* `Request`: _string_ - RPC interaction with a client
  * `connection`: _WsContext_ - connection object used for:
    * messages
    * requests
    * closing connections
  * `data`: _any_ - optional data

Receive:
* `Message`: _string_
  * `clientId`: _string_ - optional identifier
  * `data`: _any_ - optional
  * context: _Context_ - data optionally used and maintained by server per connection
* `Request`: _string_ - RPC interaction initiated by a client
  * `clientId`: _string_ - optional identifier
  * `data`: _any_ - optional
  * `context`: _Context_ - data optionally used and maintained by server per connection
  * `callback`: _Function_ - respond to request via provided function
    * `result`: _any_ - data to respond to request with
    * `timeout`: _number_ - milliseconds to timeout for client to acknowledge response if acknowledge callback is provided
    * `onAcknowledge`: _Function_ - receive confirmation that client received response
      * `response`: _any_ - optional
      * `error`: _any_ - optional

Close:
* `Connection`: _WsContext_ - connection object used for:
  * messages
  * requests
  * closing connections
* `code`: _StatusCode_ - reason for closing connection defined by [RFC #6455](https://tools.ietf.org/html/rfc6455#section-7.4)
* `reason`: _string_ - additional reason for closing client connection

#### Under The Hood:
* Heartbeat - maintain a connection to reduce data loss by polling the client
  * `pollRate`: _number_|_object_ - adjustable rate at which heartbeat requests are sent to client
    * `minimum`: _number_ - lowest interval in milliseconds
    * `maximum`: _number_ - highest interval in milliseconds
  * `timeout`: _number_|_object_ - adjustable rate at which inactive connections timeout
    * `minimum`: _number_ - lowest interval in milliseconds
    * `maximum`: _number_ - highest interval in milliseconds
  * `conserveBandwidth`: _boolean_ - reduce pollRate and maximize timeout for low-bandwidth
* Compression - reduce data sent over WebSocket defined by [ws](https://github.com/websockets/ws#websocket-compression)

## Client
### Install
`npm install universal-ws`
