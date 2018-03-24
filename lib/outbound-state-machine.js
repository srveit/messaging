'use strict';

module.exports = {
  states: [
    {
      name: 'no webSocket',
      events: {
        init: {
          nextState: 'connecting',
          actions: [
            'createWebSocket'
          ]
        }
      }
    },
    {
      name: 'connecting',
      events: {
        close: {
          nextState: 'waiting to re-open',
          actions: [
            ['setTimer', 1000]
          ]
        },
        error: {
          nextState: 'closing'
        },
        open: {
          nextState: 'waiting to ping',
          actions: [
            ['setTimer', 1000],
            'sendIdentity'
          ]
        }
      }
    },
    {
      name: 'waiting to re-open',
      events: {
        'timer expired': {
          nextState: 'connecting',
          actions: [
            'createWebSocket'
          ]
        }
      }
    },
    {
      name: 'closing',
      events: {
        close: {
          nextState: 'waiting to re-open',
          actions: [
            ['setTimer', 1000]
          ]
        }
      }
    },
    {
      name: 'waiting for pong',
      events: {
        pong: {
          nextState: 'waiting to ping',
          actions: [
            ['setTimer', 5000]
          ]
        },
        'timer expired': {
          nextState: 'closing',
          actions: [
            'closeWebSocket'
          ]
        },
        close: {
          nextState: 'waiting to re-open',
          actions: [
            ['setTimer', 1000]
          ]
        }
      }
    },
    {
      name: 'waiting to ping',
      events: {
        'timer expired': {
          nextState: 'waiting for pong',
          actions: [
            ['setTimer', 1000],
            'sendPing'
          ]
        },
        close: {
          nextState: 'waiting to re-open',
          actions: [
            ['setTimer', 1000]
          ]
        }
      }
    }
  ]
};
