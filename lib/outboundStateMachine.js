'use strict'

module.exports = {
  name: 'outbound',
  states: [
    {
      name: 'no webSocket',
      style: {
        style: 'filled',
        fillcolor: 'gray80',
      },
      events: {
        init: {
          nextState: 'connecting',
          actions: ['createWebSocket'],
        },
      },
      'close connection': {
        nextState: 'closed',
        actions: [['emit', 'closed']],
      },
    },
    {
      name: 'connecting',
      events: {
        close: {
          nextState: 'waiting to re-open',
          actions: [['setTimer', 1000]],
        },
        error: {
          nextState: 'closing',
        },
        open: {
          nextState: 'waiting to ping',
          actions: [['setTimer', 1000], 'sendIdentity'],
        },
        'close connection': {
          nextState: 'waiting for open to close',
        },
      },
    },
    {
      name: 'waiting for open to close',
      events: {
        open: {
          nextState: 'waiting to close',
          actions: ['closeWebSocket'],
        },
        close: {
          nextState: 'closed',
          actions: [['emit', 'closed']],
        },
        error: {
          nextState: 'closed',
          actions: [['emit', 'closed']],
        },
      },
    },
    {
      name: 'waiting to re-open',
      events: {
        'timer expired': {
          nextState: 'connecting',
          actions: ['createWebSocket'],
        },
      },
      'close connection': {
        nextState: 'waiting to close',
        actions: ['closeWebSocket'],
      },
    },
    {
      name: 'closing',
      events: {
        close: {
          nextState: 'waiting to re-open',
          actions: [['setTimer', 1000]],
        },
      },
      'close connection': {
        nextState: 'waiting to close',
      },
    },
    {
      name: 'waiting for pong',
      events: {
        pong: {
          nextState: 'waiting to ping',
          actions: [['setTimer', 5000]],
        },
        'timer expired': {
          nextState: 'closing',
          actions: ['closeWebSocket'],
        },
        close: {
          nextState: 'waiting to re-open',
          actions: [['setTimer', 1000]],
        },
        'close connection': {
          nextState: 'waiting to close',
          actions: ['closeWebSocket'],
        },
      },
    },
    {
      name: 'waiting to ping',
      events: {
        'timer expired': {
          nextState: 'waiting for pong',
          actions: [['setTimer', 1000], 'sendPing'],
        },
        close: {
          nextState: 'waiting to re-open',
          actions: [['setTimer', 1000]],
        },
        'close connection': {
          nextState: 'waiting to close',
          actions: ['closeWebSocket'],
        },
      },
    },
    {
      name: 'waiting to close',
      events: {
        close: {
          nextState: 'closed',
          actions: [['emit', 'closed']],
        },
        error: {
          nextState: 'closed',
          actions: [['emit', 'closed']],
        },
      },
    },
    {
      name: 'closed',
      style: {
        style: 'filled',
        fillcolor: 'gray80',
      },
      events: {},
    },
  ],
}
