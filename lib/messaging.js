'use strict';
/* eslint no-console: "off" */
const EventEmitter = require('events'),
  http = require('http'),
  os = require('os'),
  util = require('util'),
  WebSocket = require('ws'),
  {createStateMachine} = require('../../state-machine'),
  inboundStateMachine = require('./inbound-state-machine'),
  outboundStateMachine = require('./outbound-state-machine'),
  IDENTITY_TYPE = 'identity',

  sleep = async milliseconds =>
    new Promise(resolve => setTimeout(() => resolve(), milliseconds)),

  createConnectionStateMachine = (connection, machineDefinition) => {
    const {addMethod, handleEvent, label} =
      createStateMachine(machineDefinition);

    addMethod('emit', event => connection.emit(event));
    addMethod('closeWebSocket', () => connection.closeWebSocket());
    addMethod('createWebSocket', () => connection.createWebSocket());
    addMethod('sendIdentity', () => connection.sendIdentity());
    addMethod('sendPing', () => connection.sendPing());

    return Object.freeze({
      handleEvent,
      label
    });
  },

  newConnection = ({socket, emitter, fromIdentity, serverUrl}) => {
    let peerIdentity,
      webSocket = socket;

    const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'],
      connectionEmitter = new EventEmitter(),

      isOpen = () => webSocket && webSocket.readyState === webSocket.OPEN,

      isConnected = () => isOpen() && peerIdentity !== undefined,

      onConnected = listener => connectionEmitter.on('connected', listener),

      readyState = () => readyStates[webSocket.readyState] ||
        `${webSocket.readyState}`,

      createWebSocket = () => {
        if (serverUrl) {
          if (webSocket) {
            webSocket.removeAllListeners();
          }
          webSocket = new WebSocket(serverUrl);
        }
        initializeWebSocket();
      },

      webSocketSend = message =>
        util.promisify(webSocket.send)
          .bind(webSocket)(JSON.stringify(message)),

      send = ({to, message}) => webSocketSend({fromIdentity, to, message}),

      sendIdentity = () => webSocketSend({
        fromIdentity,
        type: IDENTITY_TYPE
      }),

      attachMessageHandler = () => {
        const identityHandler = identity => {
          peerIdentity = identity;
          connectionEmitter.emit('connected');
        };
        webSocket.on('message', data => {
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
            emitter.emit('message', message);
          }
        });
      },

      closeWebSocket = () => webSocket && webSocket.close(),

      sendPing = () => webSocket.ping(),
      /* eslint no-use-before-define: off */

      attachStateMachine = () => {
        ['close', 'error', 'init', 'open', 'pong'].map(event =>
          webSocket.on(event, () => stateMachine.handleEvent(event)));
      },

      initializeWebSocket = () => {
        peerIdentity = undefined;
        if (webSocket) {
          webSocket.createdAt = Date.now();
          attachStateMachine();
          attachMessageHandler();
        }
      },

      emit = event => {
        if (event === 'close' && webSocket) {
          webSocket.removeAllListeners();
          peerIdentity = undefined;
          webSocket = undefined;
        }
        emitter.emit(event);
      },

      actions = {
        emit,
        closeWebSocket,
        createWebSocket,
        sendIdentity,
        sendPing
      },

      stateMachine = createConnectionStateMachine(
        actions,
        serverUrl ? outboundStateMachine : inboundStateMachine
      ),

      label = stateMachine.label,

      checkConnectivity = timeout => {
        return new Promise((resolve) => {
          const pingId = Date.now(),
            pongReceived = buffer => {
              const receivedPingId =
                buffer ? parseInt(buffer.toString(), 10) : 0;
              if (pingId === receivedPingId) {
                clearTimeout(timeoutId);
                resolve(true);
              }
            },
            timeoutId = setTimeout(() => {
              webSocket.removeListener('pong', pongReceived);
              resolve(false);
            }, timeout);

          webSocket.once('pong', pongReceived);
          webSocket.ping(pingId, err => {
            if (err) {
              console.warn('checkConnectivity send ping error', err, label);
              clearTimeout(timeoutId);
              webSocket.removeListener('pong', pongReceived);
              resolve(false);
            }
          });
        });
      };

    initializeWebSocket();
    stateMachine.handleEvent('init');

    return Object.freeze({
      checkConnectivity,
      isConnected,
      label,
      onConnected,
      peerIdentity: () => peerIdentity,
      readyState,
      send,
      sendPing,
      serverUrl
    });
  },

  createMessaging = ({app, httpPort, identity} = {}) => {
    let webSocketServer;
    const createdAt = Date.now(),
      connections = [],
      emitter = new EventEmitter(),
      fromIdentity = identity || os.hostname(),
      serverOptions = {},

      upgradeRequiredHandler = (req, res) => {
        const body = http.STATUS_CODES[426];

        res.writeHead(426, {
          'Content-Length': body.length,
          'Content-Type': 'text/plain'
        });
        res.end(body);
      },

      requestListener = app || typeof httpPort == 'number' &&
        upgradeRequiredHandler,

      findConnection = peerIdentity =>
        connections.find(connection => connection.isConnected() &&
                                 peerIdentity &&
                                 connection.peerIdentity() === peerIdentity),

      numberOfConnections = () => connections.length,

      sendMessage = ({to, message}) => {
        const connection = findConnection(to);
        if (connection) {
          return connection.send({to, message});
        }
        console.warn(
          `sendMessage error - websocket to ${to} does not exist`,
          identity
        );
        return Promise.reject({error: `websocket to ${to} does not exist`});
      },

      serverPort = () => webSocketServer && webSocketServer.address() &&
        webSocketServer.address().port,

      start = async (timeout = 60000) => {
        const endTime = Date.now() + timeout,
          retryInterval = 100;
        if (serverOptions.server) {
          return new Promise((resolve, reject) => {
            webSocketServer = new WebSocket.Server(serverOptions);

            webSocketServer.on('connection', socket => {
              const connection = newConnection({socket, emitter, fromIdentity});
              connections.push(connection);
            });
            webSocketServer.on('error', async (error) => {
              const timeRemaining = endTime - Date.now();
              if (error.code === 'EADDRINUSE' && timeRemaining > 0) {
                await sleep(Math.max(
                  10,
                  Math.min(timeRemaining, retryInterval)
                ));
                serverOptions.server.listen(httpPort || 0);
              } else {
                console.warn('error on', identity, error);
                reject(error);
              }
            });
            webSocketServer.on('listening', () => {
              resolve(serverPort());
            });
            serverOptions.server.listen(httpPort || 0);
          });
        }
        return Promise.resolve();
      },

      stop = async () => {
        if (webSocketServer) {
          const closeWebSocketServer =
              util.promisify(webSocketServer.close).bind(webSocketServer),
            closeHttpServer =
              util.promisify(serverOptions.server.close)
                .bind(serverOptions.server);
          await closeWebSocketServer();
          webSocketServer = undefined;
          await closeHttpServer();
          serverOptions.server = undefined;
          connections.filter(connection => connection.serverUrl)
            .map(connection => connection.closeWebSocket);
          connections.splice(0);
        }
      },

      addClient = (serverUrl) => {
        if (!connections.find(connection => {
          return connection.serverUrl === serverUrl;
        })) {
          const connection = newConnection({emitter, fromIdentity, serverUrl});
          connections.push(connection);
        }
      },

      waitTillConnected = async peerIdentity => {
        const connection = findConnection(peerIdentity);
        let connected;
        if (connection) {
          connected = await connection.checkConnectivity(100);
        } else {
          connected = false;
        }
        if (!connected) {
          await sleep(100);
          return waitTillConnected(peerIdentity);
        }
        return connection;
      },

      removeAllMessageListeners = () => emitter.removeAllListeners('message'),

      onMessage = listener => emitter.on('message', listener);

    if (requestListener) {
      serverOptions.server = http.createServer(requestListener);
    }

    return Object.freeze({
      addClient,
      createdAt,
      identity: fromIdentity,
      numberOfConnections,
      onMessage,
      removeAllMessageListeners,
      sendMessage,
      serverPort,
      start,
      stop,
      waitTillConnected
    });
  };

exports.createMessaging = createMessaging;
