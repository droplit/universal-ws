# universal-ws

[![NPM](https://nodei.co/npm/universal-ws.png)](https://www.npmjs.com/package/universal-ws)
 [![NPM](https://nodei.co/npm/universal-ws-server.png)](https://www.npmjs.com/package/universal-ws-server)

![node](https://img.shields.io/github/license/droplit/universal-ws.svg?style=flat-square)

## About

An Isomorphic transport layer library for both node and browsers. Built on [ws](https://github.com/websockets/ws) and native browser [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) implementations. 

### Features

In addition to standard websocket features, `universal-ws` provides:

* Server-to-Client Heartbeat
* Request-Response bidirectionally
* Connection authentication handler promise 

## Getting started

This library is comprised of a client and server module:

* [Client Docs](./client/)
* [Server Docs](./server/) 

## Testing

### run all tests
```
npm test
```
> To run browser tests, install optional dependencies

### Unit tests
```
npm run unit-test
```

### System tests
```
npm run system-test
```

### Browser tests
```
npm install nightwatch chromedriver -G
npm run browser-test
```
