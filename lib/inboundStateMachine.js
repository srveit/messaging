'use strict'

module.exports = {
  name: 'inbound',
  initialState: 'initial',
  states: [
    {
      name: 'initial',
      style: {
        style: 'filled',
        fillcolor: 'gray80',
      },
      events: {
        init: {
          nextState: 'waiting to ping',
          actions: [['setTimer', 5000], 'sendIdentity'],
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
          nextState: 'closed',
          actions: [['emit', 'close']],
        },
        error: {
          nextState: 'closing',
          actions: ['closeWebSocket'],
        },
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
          nextState: 'closed',
          actions: [['emit', 'close']],
        },
        error: {
          nextState: 'closing',
          actions: ['closeWebSocket'],
        },
      },
    },
    {
      name: 'closing',
      events: {
        close: {
          nextState: 'closed',
          actions: [['emit', 'close']],
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
