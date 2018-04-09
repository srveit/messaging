'use strict';
const {createMessaging} = require('../index');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('messaging', () => {
  describe('createMessaging', () => {
    describe('with app', () => {
      let app, serverIdentity, messaging;
      beforeEach(() => {
        app = jasmine.createSpy('app');
        serverIdentity = 'server';
        messaging = createMessaging({app, identity: serverIdentity});
      });
      it('should succeed', () => {
        expect(messaging).toEqual({
          addClient: jasmine.any(Function),
          createdAt: jasmine.any(Number),
          identity: 'server',
          numberOfConnections: jasmine.any(Function),
          removeAllMessageListeners: jasmine.any(Function),
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
          port = await messaging.start(200000);
        });
        afterEach(async () => await messaging.stop());
        it('should return the port', () => {
          expect(port).toEqual(jasmine.any(Number));
        });
        describe('and then stopped', () => {
          beforeEach(async () => await messaging.stop());
          it('should have undefined port', () => {
            expect(messaging.serverPort()).toBe(undefined);
          });
        });
      });
    });
    describe('without app', () => {
      let serverIdentity, messaging;
      beforeEach(() => {
        serverIdentity = 'server';
        messaging = createMessaging({
          httpPort: 8111,
          identity: serverIdentity
        });
      });
      it('should succeed', () => {
        expect(messaging).toEqual({
          addClient: jasmine.any(Function),
          createdAt: jasmine.any(Number),
          identity: serverIdentity,
          numberOfConnections: jasmine.any(Function),
          removeAllMessageListeners: jasmine.any(Function),
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
          port = await messaging.start(200000);
          serverUrl = `ws://localhost:${port}/`;
        });
        afterEach(async () => await messaging.stop());
        it('should return the port', () => {
          expect(port).toEqual(jasmine.any(Number));
        });
        describe('and second messaging started with same port', () => {
          let secondServerIdentity, secondMessaging, failed;
          beforeEach(async () => {
            secondServerIdentity = 'second';
            secondMessaging = createMessaging({
              httpPort: 8111,
              identity: secondServerIdentity
            });
            failed = undefined;
            try {
              await secondMessaging.start(1000);
            } catch (error) {
              failed = error;
            }
          });
          it('should fail', () => {
            expect(failed && failed.code).toEqual('EADDRINUSE');
          });
        });
        describe('and then stopped', () => {
          beforeEach(async () => {
            await messaging.stop();
          });
          it('should have null port', () => {
            expect(messaging.serverPort()).toBe(undefined);
          });
        });
        describe('and started as client', () => {
          let server2Identity, clientMessaging;
          beforeEach(() => {
            server2Identity = 'server 2';
            clientMessaging = createMessaging({identity: server2Identity});
          });
          afterEach(async () => await clientMessaging.stop());
          it('should succeed', () => {
            expect(clientMessaging).toEqual({
              addClient: jasmine.any(Function),
              createdAt: jasmine.any(Number),
              identity: server2Identity,
              numberOfConnections: jasmine.any(Function),
              removeAllMessageListeners: jasmine.any(Function),
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
            describe('and send message to server', () => {
              let clientMessage, receivedMessage;
              beforeEach(done => {
                clientMessage = 'hello';
                messaging.removeAllMessageListeners();
                messaging.onMessage(message => {
                  receivedMessage = message;
                  done();
                });
                clientMessaging.sendMessage({
                  to: serverIdentity,
                  message: clientMessage
                });
              });
              it('should receive message', () => {
                expect(receivedMessage).toEqual({
                  fromIdentity: server2Identity,
                  to: serverIdentity,
                  message: clientMessage
                });
              });
            });
            describe('and send message from server', () => {
              let serverMessage, receivedMessage;
              beforeEach(done => {
                serverMessage = 'message';
                clientMessaging.removeAllMessageListeners();
                clientMessaging.onMessage(message => {
                  receivedMessage = message;
                  done();
                });
                messaging.sendMessage({
                  to: server2Identity,
                  message: serverMessage
                });
              });
              it('should receive message', () => {
                expect(receivedMessage).toEqual({
                  fromIdentity: serverIdentity,
                  to: server2Identity,
                  message: serverMessage
                });
              });
            });
            describe('and server is closed', () => {
              beforeEach(async () => {
                await messaging.stop();
              });
              it('should have no connections', () => {
                expect(messaging.numberOfConnections()).toBe(0);
              });
              describe('and server is restarted', () => {
                beforeEach(async () => {
                  messaging = createMessaging({
                    httpPort: 8111,
                    identity: serverIdentity
                  });
                  await messaging.start(200000);
                  await clientMessaging.waitTillConnected(serverIdentity);
                });
                describe('and send message to server', () => {
                  let clientMessage, receivedMessage;
                  beforeEach(done => {
                    clientMessage = 'hello';
                    messaging.removeAllMessageListeners();
                    messaging.onMessage(message => {
                      receivedMessage = message;
                      done();
                    });
                    clientMessaging.sendMessage({
                      to: serverIdentity,
                      message: clientMessage
                    });
                  });
                  it('should receive message', () => {
                    expect(receivedMessage).toEqual({
                      fromIdentity: server2Identity,
                      to: serverIdentity,
                      message: clientMessage
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
