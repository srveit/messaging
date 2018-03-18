'use strict';
const {createMessaging} = require('../index');

describe('messaging', () => {
  describe('createMessaging', () => {
    describe('with app', () => {
      let app, serverIdentity, messaging;
      beforeEach(() => {
        app = jasmine.createSpy('app');
        serverIdentity = 'server';
        messaging = createMessaging({app, identity: serverIdentity});
      });
      afterEach(async () => messaging.stop());
      it('should succeed', () => {
        expect(messaging).toEqual({
          addClient: jasmine.any(Function),
          identity: 'server',
          onMessage: jasmine.any(Function),
          sendMessage: jasmine.any(Function),
          serverPort: jasmine.any(Function),
          start: jasmine.any(Function),
          stop: jasmine.any(Function),
          waitTillConnected: jasmine.any(Function)
        });
      });
      describe('when started', () => {
        let port;
        beforeEach(async () => {
          port = await messaging.start();
        });
        it('should return the port', () => {
          expect(port).toEqual(jasmine.any(Number));
        });
        describe('and then stopped', () => {
          beforeEach(async () => {
            await messaging.stop();
          });
          it('should have null port', () => {
            expect(messaging.serverPort()).toBe(null);
          });
        });
      });
    });
    describe('without app', () => {
      let serverIdentity, messaging;
      beforeEach(() => {
        serverIdentity = 'server';
        messaging = createMessaging({
          port: 0,
          identity: serverIdentity
        });
      });
      afterEach(async () => messaging.stop());
      it('should succeed', () => {
        expect(messaging).toEqual({
          addClient: jasmine.any(Function),
          identity: serverIdentity,
          onMessage: jasmine.any(Function),
          sendMessage: jasmine.any(Function),
          serverPort: jasmine.any(Function),
          start: jasmine.any(Function),
          stop: jasmine.any(Function),
          waitTillConnected: jasmine.any(Function)
        });
      });
      describe('when started', () => {
        let port, serverUrl;
        beforeEach(async () => {
          port = await messaging.start();
          serverUrl = `ws://localhost:${port}/`;
        });
        it('should return the port', () => {
          expect(port).toEqual(jasmine.any(Number));
        });
        describe('and then stopped', () => {
          beforeEach(async () => {
            await messaging.stop();
          });
          it('should have null port', () => {
            expect(messaging.serverPort()).toBe(null);
          });
        });
        describe('and started as client', () => {
          let server2Identity, clientMessaging;
          beforeEach(() => {
            server2Identity = 'server 2';
            clientMessaging = createMessaging({identity: server2Identity});
          });
          afterEach(async () => clientMessaging.stop());
          it('should succeed', () => {
            expect(clientMessaging).toEqual({
              addClient: jasmine.any(Function),
              identity: server2Identity,
              onMessage: jasmine.any(Function),
              sendMessage: jasmine.any(Function),
              serverPort: jasmine.any(Function),
              start: jasmine.any(Function),
              stop: jasmine.any(Function),
              waitTillConnected: jasmine.any(Function)
            });
          });
          describe('and connected to server', () => {
            beforeEach(async () => {
              clientMessaging.addClient(serverUrl);
              await clientMessaging.waitTillConnected(serverIdentity);
              await messaging.waitTillConnected(server2Identity);
            });
            describe('and send event to server', () => {
              let message, receivedEvent;
              beforeEach(done => {
                message = 'hello';
                messaging.onMessage(event => {
                  receivedEvent = event;
                  done();
                });
                clientMessaging.sendMessage({
                  to: serverIdentity,
                  message: message
                });
              });
              it('should receive event', () => {
                expect(receivedEvent).toEqual({
                  fromIdentity: server2Identity,
                  to: serverIdentity,
                  message: message
                });
              });
            });
            describe('and send event from server', () => {
              let message, receivedEvent;
              beforeEach(done => {
                message = 'message';
                clientMessaging.onMessage(event => {
                  receivedEvent = event;
                  done();
                });
                messaging.sendMessage({
                  to: server2Identity,
                  message: message
                });
              });
              it('should receive event', () => {
                expect(receivedEvent).toEqual({
                  fromIdentity: serverIdentity,
                  to: server2Identity,
                  message: message
                });
              });
            });
          });
        });
      });
    });
  });
});
