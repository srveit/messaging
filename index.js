'use strict';
const http = require('http'),
  os = require('os'),
  url = require('url'),
  WebSocket = require('ws');

const isWebSocketAlive = webSocket => {
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
};

const newWebSocket = serverUrl => {
  const webSocket = new WebSocket(serverUrl);

  webSocket.on('open', () => {
    console.info(`connected to ${serverUrl}`);
    webSocket.isAlive = true;
    webSocket.send('something from ' + os.hostname());
  });

  webSocket.on('message', data => {
    webSocket.isAlive = true;
    console.info('message', data.toString());
  });

  webSocket.on('pong', data => {
    webSocket.isAlive = true;
  });

  webSocket.on('ping', data => {
    webSocket.isAlive = true;
  });

  webSocket.on('error', error => {
    console.warn('error', error);
  });
  return webSocket;
};

const watchWebSockets = webSockets => {
  setInterval(() => {
    webSockets.server.clients.forEach(isWebSocketAlive);
    if (webSockets.serverUrl && !isWebSocketAlive(webSockets.client)) {
      webSockets.client = newWebSocket(webSockets.serverUrl);
    }
  }, 5000);
};

const sendEvent = (client, event) => {
  if (client) {
    try {
      client.send(JSON.stringify(event, null, 2));
    } catch (error) {
      console.error('error sending event', error.toString());
    }
  }
};

const createWebSockets = (app, serverUrl) => {
  const server = http.createServer(app),
    webSockets = {
      server: new WebSocket.Server({ server }),
      serverUrl,
      client: serverUrl && newWebSocket(serverUrl)
    };

  webSockets.server.on('connection', (webSocket, req) => {
    const location = url.parse(req.url, true);
    // You might use location.query.access_token to authenticate or
    // share sessions or req.headers.cookie (see
    // http://stackoverflow.com/a/16395220/151312)

    webSocket.isAlive = true;

    webSocket.on('message', data => {
      webSocket.isAlive = true;
      console.info('message', data.toString());
    });

    webSocket.on('pong', data => {
      webSocket.isAlive = true;
    });

    webSocket.on('ping', data => {
      webSocket.isAlive = true;
    });

    webSocket.on('error', error => {
      console.warn('error', error);
    });

    webSocket.send('something from ' + os.hostname());
  });

  server.listen(8080, () => console.info('Listening at http://localhost:%d',
                                         server.address().port));
  watchWebSockets(webSockets);

  webSockets.sendEvents = events => {
    events.map(event => sendEvent(webSockets.client, event));
  };
  return webSockets;
};

exports.createWebSockets = createWebSockets;
