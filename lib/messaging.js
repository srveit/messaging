'use strict'
/* eslint no-console: "off" */
const EventEmitter = require('events')
const http = require('http')
const os = require('os')
const util = require('util')
const WebSocket = require('ws')
const { createStateMachine } = require('state-machine')
const inboundStateMachine = require('./inboundStateMachine')
const outboundStateMachine = require('./outboundStateMachine')
const IDENTITY_TYPE = 'identity'
const sleep = async (milliseconds) =>
  new Promise((resolve) => setTimeout(() => resolve(), milliseconds))
const createConnectionStateMachine = (connection, machineDefinition) => {
  const { addMethod, currentState, handleEvent, name } = createStateMachine({
    states: machineDefinition.states,
    name: machineDefinition.name,
  })

  addMethod('emit', (event) => connection.emit(event))
  addMethod('closeWebSocket', () => connection.closeWebSocket())
  addMethod('createWebSocket', () => connection.createWebSocket())
  addMethod('sendIdentity', () => connection.sendIdentity())
  addMethod('sendPing', () => connection.sendPing())

  return Object.freeze({
    currentState,
    handleEvent,
    name,
  })
}

const newConnection = ({ socket, emitter, fromIdentity, serverUrl }) => {
  let peerIdentity
  let webSocket = socket

  const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']
  const connectionEmitter = new EventEmitter()
  const isOpen = () => webSocket && webSocket.readyState === webSocket.OPEN
  const isConnected = () => isOpen() && peerIdentity !== undefined
  const onConnected = (listener) => connectionEmitter.on('connected', listener)

  const readyState = () =>
    readyStates[webSocket.readyState] || `${webSocket.readyState}`

  const createWebSocket = () => {
    if (serverUrl) {
      if (webSocket) {
        webSocket.removeAllListeners()
      }
      webSocket = new WebSocket(serverUrl)
    }
    initializeWebSocket()
  }

  const webSocketSend = (message) => {
    if (webSocket) {
      return util.promisify(webSocket.send).bind(webSocket)(
        JSON.stringify(message)
      )
    }
    return Promise.resolve(false)
  }

  const send = ({ to, message }) => webSocketSend({ fromIdentity, to, message })

  const sendIdentity = () =>
    webSocketSend({
      fromIdentity,
      type: IDENTITY_TYPE,
    })

  const attachMessageHandler = () => {
    const identityHandler = (identity) => {
      peerIdentity = identity
      connectionEmitter.emit('connected', peerIdentity)
    }
    webSocket.on('message', (data) => {
      let message
      try {
        message = JSON.parse(data)
      } catch (error) {
        message = {
          type: 'unknown',
          message: data,
        }
      }
      if (message.type === IDENTITY_TYPE) {
        identityHandler(message.fromIdentity)
      } else {
        emitter.emit('message', message)
      }
    })
  }

  const closeWebSocket = () => {
    if (webSocket) {
      webSocket.close()
    } else {
      emit('close')
    }
  }

  const sendPing = () => {
    if (webSocket) {
      try {
        return webSocket.ping()
      } catch (error) {
        return Promise.resolve(false)
      }
    }
    return Promise.resolve(false)
  }
  /* eslint no-use-before-define: off */

  const attachStateMachine = () => {
    ;['close', 'error', 'init', 'open', 'pong', 'unexpected-response'].map(
      (event) => webSocket.on(event, () => stateMachine.handleEvent(event))
    )
  }
  const initializeWebSocket = () => {
    peerIdentity = undefined
    if (webSocket) {
      webSocket.createdAt = Date.now()
      attachStateMachine()
      attachMessageHandler()
    }
  }
  const emit = (event) => {
    if (event === 'close' && webSocket) {
      webSocket.removeAllListeners()
      peerIdentity = undefined
      webSocket = undefined
    }
    emitter.emit(event)
  }
  const actions = {
    emit,
    closeWebSocket,
    createWebSocket,
    sendIdentity,
    sendPing,
  }
  const stateMachine = createConnectionStateMachine(
    actions,
    serverUrl ? outboundStateMachine : inboundStateMachine
  )

  const checkConnectivity = (timeout) => {
    return new Promise((resolve) => {
      const pingId = Date.now()
      const pongReceived = (buffer) => {
        const receivedPingId = buffer ? parseInt(buffer.toString(), 10) : 0
        if (pingId === receivedPingId) {
          clearTimeout(timeoutId)
          resolve(true)
        }
      }
      const timeoutId = setTimeout(() => {
        webSocket.removeListener('pong', pongReceived)
        resolve(false)
      }, timeout)

      webSocket.once('pong', pongReceived)
      webSocket.ping(pingId, (err) => {
        if (err) {
          console.warn('checkConnectivity send ping error', err, stateMachine.name)
          clearTimeout(timeoutId)
          webSocket.removeListener('pong', pongReceived)
          resolve(false)
        }
      })
    })
  }

  initializeWebSocket()
  stateMachine.handleEvent('init')

  return Object.freeze({
    checkConnectivity,
    close: () => stateMachine.handleEvent('close connection'),
    currentState: stateMachine.currentState,
    isConnected,
    onConnected,
    peerIdentity: () => peerIdentity,
    readyState,
    send,
    sendPing,
    serverUrl,
  })
}
const createMessaging = ({ app, httpPort, identity } = {}) => {
  let webSocketServer
  const createdAt = Date.now()
  const connections = []
  const emitter = new EventEmitter()
  const fromIdentity = identity || os.hostname()
  const serverOptions = {}
  const upgradeRequiredHandler = (req, res) => {
    const body = http.STATUS_CODES[426]

    res.writeHead(426, {
      'Content-Length': body.length,
      'Content-Type': 'text/plain',
    })
    res.end(body)
  }
  const requestListener =
    app || (typeof httpPort === 'number' && upgradeRequiredHandler)
  const findConnection = (peerIdentity) =>
    connections.find(
      (connection) =>
        connection.isConnected() &&
        peerIdentity &&
        connection.peerIdentity() &&
        (connection.peerIdentity() === peerIdentity ||
          connection.peerIdentity().startsWith(`${peerIdentity}.`))
    )
  const numberOfConnections = () => connections.length
  const sendMessage = ({ to, message }) => {
    const connection = findConnection(to)
    if (connection) {
      return connection.send({ to, message })
    }
    console.warn(
      `sendMessage error - websocket to ${to} does not exist`,
      fromIdentity
    )
    return Promise.resolve(false)
  }
  const serverPort = () =>
    webSocketServer &&
    webSocketServer.address() &&
    webSocketServer.address().port
  const start = async (timeout = 60000) => {
    const endTime = Date.now() + timeout
    const retryInterval = 100
    if (serverOptions.server) {
      return new Promise((resolve, reject) => {
        webSocketServer = new WebSocket.Server(serverOptions)

        webSocketServer.on('connection', (socket) => {
          const connection = newConnection({
            socket,
            emitter,
            fromIdentity,
          })
          connection.onConnected(() => emitter.emit('connection', connection))
          connections.push(connection)
        })
        webSocketServer.on('error', async (error) => {
          const timeRemaining = endTime - Date.now()
          if (error.code === 'EADDRINUSE' && timeRemaining > 0) {
            await sleep(Math.max(10, Math.min(timeRemaining, retryInterval)))
            serverOptions.server.listen(httpPort || 0)
          } else {
            console.warn(`server ${fromIdentity} error - ${error.message}`)
            reject(error)
          }
        })
        webSocketServer.on('listening', () => {
          resolve(serverPort())
        })
        serverOptions.server.listen(httpPort || 0)
      })
    }
    return Promise.resolve()
  }

  const stop = async () => {
    if (webSocketServer) {
      const closeWebSocketServer = util
        .promisify(webSocketServer.close)
        .bind(webSocketServer)
      const closeHttpServer = util
        .promisify(serverOptions.server.close)
        .bind(serverOptions.server)
      await closeWebSocketServer()
      webSocketServer = undefined
      await closeHttpServer()
      serverOptions.server = undefined
      connections
        .filter((connection) => connection.serverUrl)
        .map((connection) => connection.closeWebSocket)
      connections.splice(0)
    }
  }

  const addClient = (serverUrl) => {
    if (!connections.find((connection) => connection.serverUrl === serverUrl)) {
      const connection = newConnection({ emitter, fromIdentity, serverUrl })
      connection.onConnected(() => emitter.emit('connection', connection))
      connections.push(connection)
    }
  }

  const removeClient = async (serverUrl) => {
    const index = connections.findIndex(
      (connection) => connection.serverUrl === serverUrl
    )
    if (index >= 0) {
      const [clientConnection] = connections.splice(index, 1)
      await clientConnection.close()
    }
  }

  const waitTillConnected = async (peerIdentity) => {
    const connection = findConnection(peerIdentity)
    let connected
    if (connection) {
      connected = await connection.checkConnectivity(100)
    } else {
      connected = false
    }
    if (!connected) {
      await sleep(100)
      return waitTillConnected(peerIdentity)
    }
    return connection
  }
  const removeAllMessageListeners = () => emitter.removeAllListeners('message')
  const onConnection = (listener) => emitter.on('connection', listener)
  const onMessage = (listener) => emitter.on('message', listener)

  if (requestListener) {
    serverOptions.server = http.createServer(requestListener)
  }

  return Object.freeze({
    addClient,
    createdAt,
    identity: fromIdentity,
    numberOfConnections,
    onConnection,
    onMessage,
    removeAllMessageListeners,
    removeClient,
    sendMessage,
    serverPort,
    start,
    stop,
    waitTillConnected,
  })
}

exports.createMessaging = createMessaging
