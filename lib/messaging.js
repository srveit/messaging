'use strict';
/* eslint no-console: "off" */
const EventEmitter = require('events'),
  http = require('http'),
  os = require('os'),
  _ = require('lodash'),
  // url = require('url'),
  WebSocket = require('ws'),
  IDENTITY_TYPE = 'identity',

  isWebSocketAlive = webSocket => {
    if (!webSocket) {
      return false;
    }
    if (webSocket.isAlive === false) {
      webSocket.terminate();
      return false;
    }
    webSocket.isAlive = false;
    try {
      webSocket.ping();
    } catch (error) {
      if (error.code !== 'ECONNREFUSED') {
        console.warn('ping error', error);
      }
    }
    return true;
  },

  setUpWebSocket = (webSocket, emitter, identityHandler) => {
    webSocket.on('message', data => {
      webSocket.isAlive = true;
      let message;
      try {
        message = JSON.parse(data);
      } catch (error) {
        message = {
          type: 'unknown',
          message: data
        };
      }
      if (message.type === IDENTITY_TYPE) {
        identityHandler(message.fromIdentity);
      } else {
        console.info('message', message);
        emitter.emit('message', message);
      }
    });

    webSocket.on('pong', () => webSocket.isAlive = true);

    webSocket.on('ping', () => webSocket.isAlive = true);

    webSocket.on('error', error => console.warn('error', error));
  },

  sendIdentity = (webSocket, fromIdentity) => {
    webSocket.isAlive = true;
    webSocket.send(JSON.stringify({
      fromIdentity,
      type: IDENTITY_TYPE
    }));
  },

  newConnection = ({socket, emitter, fromIdentity, serverUrl}) => {
    let peerIdentity;

    const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'],
      connectionEmitter = new EventEmitter(),

      webSocket = socket || new WebSocket(serverUrl),

      isOpen = () => webSocket.readyState === webSocket.OPEN,

      isConnected = () => isOpen && peerIdentity !== undefined,

      onConnected = listener => connectionEmitter.on('connected', listener),

      readyState = () => readyStates[webSocket.readyState] ||
        `${webSocket.readyState}`,

      send = ({to, message}) =>
        webSocket.send(JSON.stringify({fromIdentity, to, message}));

    setUpWebSocket(webSocket, emitter, identity => {
      peerIdentity = identity;
      connectionEmitter.emit('connected');
    });

    if (isOpen()) {
      sendIdentity(webSocket, fromIdentity);
    } else {
      webSocket.on('open', () => {
        sendIdentity(webSocket, fromIdentity);
      });
    }

    return Object.freeze({
      isConnected,
      onConnected,
      peerIdentity: () => peerIdentity,
      readyState,
      send,
      url: webSocket.url
    });
  },

  createMessaging = ({app, port, httpPort, identity} = {}) => {
    let serverOptions, webSocketServer, clientWatcher;
    const outboundConnections = [],
      inboundConnections = [],
      emitter = new EventEmitter(),
      fromIdentity = identity || os.hostname(),

      findConnection = peerIdentity =>
        outboundConnections.find(connection => peerIdentity &&
                                 connection.peerIdentity() === peerIdentity) ||
        inboundConnections.find(connection => peerIdentity &&
                                 connection.peerIdentity() === peerIdentity),

      sendMessage = ({to, message}) => {
        const connection = findConnection(to);
        if (connection) {
          connection.send({to, message});
        }
      },

      checkClientConnections = () => {
        if (webSocketServer) {
          webSocketServer.clients.forEach(isWebSocketAlive);
        }
      },

      watchWebSockets = () => {
        if (!clientWatcher) {
          clientWatcher = setInterval(checkClientConnections, 5000);
        }
      },

      serverPort = () => webSocketServer && webSocketServer.address() &&
        webSocketServer.address().port,

      start = async () => {
        if (serverOptions.server || _.isNumber(serverOptions.port)) {
          return new Promise((resolve, reject) => {
            webSocketServer = new WebSocket.Server(serverOptions);
            if (serverOptions.server) {
              serverOptions.server.listen(
                httpPort || 0
              );
            }
            webSocketServer.on('connection', socket => {
              inboundConnections.push(
                newConnection({socket, emitter, fromIdentity})
              );
            });
            webSocketServer.on('listening', (err) => {
              const httpServerUrl = `http://localhost:${serverPort()}`;
              if (err) {
                reject(err);
              } else {
                console.info(`Listening at ${httpServerUrl}`);
                resolve(serverPort());
              }
            });
          });
        }
        return Promise.resolve();
      },

      stop = () => {
        outboundConnections.map(connection => connection.close);
        if (webSocketServer) {
          return new Promise(resolve => webSocketServer.close(() => resolve()));
        }
        return Promise.resolve();
      },

      addClient = (serverUrl) => {
        outboundConnections.push(
          newConnection({emitter, fromIdentity, serverUrl})
        );
      },

      waitTillConnected = peerIdentity => new Promise((resolve) => {
        const connection = findConnection(peerIdentity);
        if (!connection) {
          setTimeout(() => resolve(waitTillConnected(peerIdentity)), 100);
        } else if (connection.isConnected()) {
          resolve();
        } else {
          connection.onConnected(() => resolve());
        }
      }),

      onMessage = listener => emitter.on('message', listener);

    if (app) {
      serverOptions = {
        server: http.createServer(app)
      };
    } else if (_.isNumber(port)) {
      serverOptions = {
        port
      };
    }

    watchWebSockets();

    return Object.freeze({
      addClient,
      identity: fromIdentity,
      onMessage,
      sendMessage,
      serverPort,
      start,
      stop,
      waitTillConnected
    });
  };

exports.createMessaging = createMessaging;
