'use strict';
/* eslint no-console: "off" */
const EventEmitter = require('events'),
  http = require('http'),
  os = require('os'),
  _ = require('lodash'),
  // url = require('url'),
  WebSocket = require('ws'),
  {createStateMachine} = require('../../state-machine'),
  inboundStateMachine = require('./inbound-state-machine'),
  outboundStateMachine = require('./outbound-state-machine'),
  IDENTITY_TYPE = 'identity',

  createConnectionStateMachine = (connection, machineDefinition) => {
    const {addMethod, handleEvent} = createStateMachine(machineDefinition);

    addMethod('emit', event => connection.emit(event));
    addMethod('closeWebSocket', () => connection.closeWebSocket());
    addMethod('createWebSocket', () => connection.createWebSocket());
    addMethod('sendIdentity', () => connection.sendIdentity());
    addMethod('sendPing', () => connection.sendPing());

    return Object.freeze({
      handleEvent
    });
  },

  newConnection = ({socket, emitter, fromIdentity, serverUrl}) => {
    let peerIdentity,
      stateMachine,
      webSocket = socket;

    const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'],
      connectionEmitter = new EventEmitter(),

      isOpen = () => webSocket && webSocket.readyState === webSocket.OPEN,

      isConnected = () => isOpen && peerIdentity !== undefined,

      onConnected = listener => connectionEmitter.on('connected', listener),

      readyState = () => readyStates[webSocket.readyState] ||
        `${webSocket.readyState}`,

      send = async ({to, message}) => new Promise(
        (resolve, reject) =>
          webSocket.send(JSON.stringify({fromIdentity, to, message}), err => {
            console.log('sent', err);
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          })
      ),

      sendIdentity = () => {
        webSocket.isAlive = true;
        webSocket.send(JSON.stringify({
          fromIdentity,
          type: IDENTITY_TYPE
        }));
      },

      setUpWebSocket = (identityHandler) => {
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

        webSocket.on('ping', () => {
          console.log('received ping');
          webSocket.isAlive = true;
        });

        webSocket.on('error', error => console.warn('error', error));
      },

      checkConnectivity = () => {
        if (serverUrl) {
          if (!webSocket) {
            console.log('connecting to', serverUrl);
            webSocket = new WebSocket(serverUrl);
          }
        } else if (!webSocket) {
          return;
        }
        if (webSocket.isAlive === false) {
          webSocket.terminate();
          webSocket = undefined;
          return;
        }
        webSocket.isAlive = false;
        if (isOpen()) {
          try {
            console.log('ping');
            webSocket.ping();
          } catch (error) {
            if (error.code !== 'ECONNREFUSED') {
              console.warn('ping error', error);
            }
          }
        }
      },
      attachStateMachine = () => {
        ['close', 'error', 'init', 'open', 'pong'].map(event =>
          webSocket.on(event, () => stateMachine.handleEvent(event)));
      },
      closeWebSocket = () => webSocket && webSocket.close(),
      createWebSocket = () => {
        console.log('connecting to', serverUrl);
        webSocket = new WebSocket(serverUrl);
        attachStateMachine();
      },
      sendPing = () => {
        webSocket.ping();
      },
      actions = {
        emit: event => emitter.emit(event),
        closeWebSocket,
        createWebSocket,
        sendIdentity,
        sendPing
      };

    if (serverUrl) {
      stateMachine =
        createConnectionStateMachine(actions, outboundStateMachine);
    } else {
      stateMachine =
        createConnectionStateMachine(actions, inboundStateMachine);
    }
    checkConnectivity();

    setUpWebSocket(identity => {
      peerIdentity = identity;
      connectionEmitter.emit('connected');
    });

    if (isOpen()) {
      sendIdentity();
    } else {
      webSocket.on('open', () => {
        sendIdentity();
      });
    }

    return Object.freeze({
      isConnected,
      checkConnectivity,
      onConnected,
      peerIdentity: () => peerIdentity,
      readyState,
      send
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

      connections = () => outboundConnections.concat(inboundConnections),

      numberOfConnections = () => connections().length,

      sendMessage = ({to, message}) => {
        const connection = findConnection(to);
        if (connection) {
          return connection.send({to, message});
        }
        return Promise.reject({error: `websocket to ${to} does not exist`});
      },

      checkConnections = () =>
        inboundConnections.map(connection => connection.checkConnectivity()),

      watchWebSockets = () => {
        if (!clientWatcher) {
          clientWatcher = setInterval(checkConnections, 5000);
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
              console.log('new connection', socket.readyState);
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
        outboundConnections.splice(0);
        if (webSocketServer) {
          return new Promise(resolve => webSocketServer.close(() => {
            inboundConnections.splice(0);
            resolve();
          }));
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

      removeAllMessageListeners = () => emitter.removeAllListeners('message'),

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

//    watchWebSockets();

    return Object.freeze({
      addClient,
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
