'use strict'
const { createMessaging } = require('../index')

describe('messaging', () => {
  describe('createMessaging', () => {
    describe('with app', () => {
      let app, serverIdentity, messaging

      beforeEach(() => {
        app = jest.fn()
        serverIdentity = 'server.foo'
        messaging = createMessaging({ app, identity: serverIdentity })
      })

      it('should succeed', () => {
        expect(messaging).toEqual({
          addClient: expect.any(Function),
          createdAt: expect.any(Number),
          identity: serverIdentity,
          numberOfConnections: expect.any(Function),
          removeClient: expect.any(Function),
          removeAllMessageListeners: expect.any(Function),
          onConnection: expect.any(Function),
          onMessage: expect.any(Function),
          sendMessage: expect.any(Function),
          serverPort: expect.any(Function),
          start: expect.any(Function),
          stop: expect.any(Function),
          waitTillConnected: expect.any(Function),
        })
      })

      describe('when started', () => {
        let port, serverUrl

        beforeEach(async () => {
          port = await messaging.start(200000)
          serverUrl = `ws://localhost:${port}/`
        })

        afterEach(async () => await messaging.stop())

        it('should return the port', () => {
          expect(port).toEqual(expect.any(Number))
        })

        describe('and started as client', () => {
          let server2Identity, clientMessaging

          beforeEach(() => {
            server2Identity = 'server 3'
            clientMessaging = createMessaging({ identity: server2Identity })
          })

          afterEach(async () => await messaging.stop())

          it('should succeed', () => {
            expect(clientMessaging).toEqual({
              addClient: expect.any(Function),
              createdAt: expect.any(Number),
              identity: server2Identity,
              numberOfConnections: expect.any(Function),
              removeClient: expect.any(Function),
              removeAllMessageListeners: expect.any(Function),
              onConnection: expect.any(Function),
              onMessage: expect.any(Function),
              sendMessage: expect.any(Function),
              serverPort: expect.any(Function),
              start: expect.any(Function),
              stop: expect.any(Function),
              waitTillConnected: expect.any(Function),
            })
          })

          describe('and connected to server', () => {
            beforeEach(async () => {
              clientMessaging.addClient(serverUrl)
              await clientMessaging.waitTillConnected(serverIdentity)
              await messaging.waitTillConnected(server2Identity)
            })

            afterEach(async () => await clientMessaging.removeClient(serverUrl))

            describe('and send message to server', () => {
              let clientMessage, receivedMessage, shortServerIdentity
              beforeEach((done) => {
                clientMessage = 'hello'
                shortServerIdentity = serverIdentity.split('.')[0]
                messaging.removeAllMessageListeners()
                messaging.onMessage((message) => {
                  receivedMessage = message
                  done()
                })
                clientMessaging.sendMessage({
                  to: shortServerIdentity,
                  message: clientMessage,
                })
              })

              it('should receive message', () => {
                expect(receivedMessage).toEqual({
                  fromIdentity: server2Identity,
                  to: shortServerIdentity,
                  message: clientMessage,
                })
              })
            })

            describe('and send message from server', () => {
              let serverMessage, receivedMessage
              beforeEach((done) => {
                serverMessage = 'message'
                clientMessaging.removeAllMessageListeners()
                clientMessaging.onMessage((message) => {
                  receivedMessage = message
                  done()
                })
                messaging.sendMessage({
                  to: server2Identity,
                  message: serverMessage,
                })
              })

              it('should receive message', () => {
                expect(receivedMessage).toEqual({
                  fromIdentity: serverIdentity,
                  to: server2Identity,
                  message: serverMessage,
                })
              })
            })
          })
        })

        describe('and then stopped', () => {
          beforeEach(async () => await messaging.stop())
          it('should have undefined port', () => {
            expect(messaging.serverPort()).toBe(undefined)
          })
        })
      })
    })

    describe('without app', () => {
      let serverIdentity, messaging
      beforeEach(() => {
        serverIdentity = 'server'
        messaging = createMessaging({
          httpPort: 8111,
          identity: serverIdentity,
        })
      })

      it('should succeed', () => {
        expect(messaging).toEqual({
          addClient: expect.any(Function),
          createdAt: expect.any(Number),
          identity: serverIdentity,
          numberOfConnections: expect.any(Function),
          removeClient: expect.any(Function),
          removeAllMessageListeners: expect.any(Function),
          onConnection: expect.any(Function),
          onMessage: expect.any(Function),
          sendMessage: expect.any(Function),
          serverPort: expect.any(Function),
          start: expect.any(Function),
          stop: expect.any(Function),
          waitTillConnected: expect.any(Function),
        })
      })

      describe('when started', () => {
        let port, serverUrl

        beforeEach(async () => {
          port = await messaging.start(200000)
          serverUrl = `ws://localhost:${port}/`
        })

        afterEach(async () => await messaging.stop())

        it('should return the port', () => {
          expect(port).toEqual(expect.any(Number))
        })

        describe('and second messaging started with same port', () => {
          let secondServerIdentity, secondMessaging, failed

          beforeEach(async () => {
            jest.spyOn(console, 'warn').mockImplementation(() => {})
            secondServerIdentity = 'second'
            secondMessaging = createMessaging({
              httpPort: 8111,
              identity: secondServerIdentity,
            })
            failed = undefined
            try {
              await secondMessaging.start(1000)
            } catch (error) {
              failed = error
            }
          })

          it('should fail', () => {
            expect(failed && failed.code).toEqual('EADDRINUSE')
          })
        })

        describe('and then stopped', () => {
          beforeEach(async () => {
            await messaging.stop()
          })

          it('should have null port', () => {
            expect(messaging.serverPort()).toBe(undefined)
          })
        })

        describe('and started as client', () => {
          let server2Identity, clientMessaging
          beforeEach(() => {
            server2Identity = 'server 2'
            clientMessaging = createMessaging({ identity: server2Identity })
          })

          it('should succeed', () => {
            expect(clientMessaging).toEqual({
              addClient: expect.any(Function),
              createdAt: expect.any(Number),
              identity: server2Identity,
              numberOfConnections: expect.any(Function),
              removeClient: expect.any(Function),
              removeAllMessageListeners: expect.any(Function),
              onConnection: expect.any(Function),
              onMessage: expect.any(Function),
              sendMessage: expect.any(Function),
              serverPort: expect.any(Function),
              start: expect.any(Function),
              stop: expect.any(Function),
              waitTillConnected: expect.any(Function),
            })
          })

          describe('and connected to server', () => {
            beforeEach(async () => {
              clientMessaging.addClient(serverUrl)
              await clientMessaging.waitTillConnected(serverIdentity)
              await messaging.waitTillConnected(server2Identity)
            })

            afterEach(async () => await clientMessaging.removeClient(serverUrl))

            describe('and send message to server', () => {
              let clientMessage, receivedMessage

              beforeEach((done) => {
                clientMessage = 'hello'
                messaging.removeAllMessageListeners()
                messaging.onMessage((message) => {
                  receivedMessage = message
                  done()
                })
                clientMessaging.sendMessage({
                  to: serverIdentity,
                  message: clientMessage,
                })
              })

              it('should receive message', () => {
                expect(receivedMessage).toEqual({
                  fromIdentity: server2Identity,
                  to: serverIdentity,
                  message: clientMessage,
                })
              })
            })

            describe('and send message from server', () => {
              let serverMessage, receivedMessage

              beforeEach((done) => {
                serverMessage = 'message'
                clientMessaging.removeAllMessageListeners()
                clientMessaging.onMessage((message) => {
                  receivedMessage = message
                  done()
                })
                messaging.sendMessage({
                  to: server2Identity,
                  message: serverMessage,
                })
              })

              it('should receive message', () => {
                expect(receivedMessage).toEqual({
                  fromIdentity: serverIdentity,
                  to: server2Identity,
                  message: serverMessage,
                })
              })
            })

            describe('and server is closed', () => {
              beforeEach(async () => {
                await messaging.stop()
              })

              it('should have no connections', () => {
                expect(messaging.numberOfConnections()).toBe(0)
              })

              describe('and server is restarted', () => {
                beforeEach(async () => {
                  messaging = createMessaging({
                    httpPort: 8111,
                    identity: serverIdentity,
                  })
                  await messaging.start(200000)
                  await clientMessaging.waitTillConnected(serverIdentity)
                })

                afterEach(async () => await messaging.stop())

                describe('and send message to server', () => {
                  let clientMessage, receivedMessage

                  beforeEach((done) => {
                    clientMessage = 'hello'
                    messaging.removeAllMessageListeners()
                    messaging.onMessage((message) => {
                      receivedMessage = message
                      done()
                    })
                    clientMessaging.sendMessage({
                      to: serverIdentity,
                      message: clientMessage,
                    })
                  })

                  it('should receive message', () => {
                    expect(receivedMessage).toEqual({
                      fromIdentity: server2Identity,
                      to: serverIdentity,
                      message: clientMessage,
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })
})
