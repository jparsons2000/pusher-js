describe("Connection", function() {
  var transport;
  var connection;

  beforeEach(function() {
    transport = Pusher.Mocks.getTransport();
    connection = new Pusher.Connection("111.22", transport);
  });

  describe("#supportsPing", function() {
    it("should return true if transport supports ping", function() {
      transport.supportsPing.andReturn(true);
      expect(connection.supportsPing()).toBe(true);
    });

    it("should return false if transport does not support ping", function() {
      transport.supportsPing.andReturn(false);
      expect(connection.supportsPing()).toBe(false);
    });
  });

  describe("#send", function() {
    it("should pass the data to the transport", function() {
      transport.send.andReturn(true);
      connection.send("proxy");
      expect(transport.send).toHaveBeenCalledWith("proxy");
    });

    it("should return true if the transport sent the data", function() {
      transport.send.andReturn(true);
      expect(connection.send("proxy")).toBe(true);
    });

    it("should return false if the transport did not send the data", function() {
      transport.send.andReturn(false);
      expect(connection.send("proxy")).toBe(false);
    });

    it("should send events in correct format", function() {
      expect(connection.send_event("test", [1,2,3])).toBe(true);
      expect(transport.send).toHaveBeenCalledWith(JSON.stringify({
        event: "test",
        data: [1,2,3]
      }));
    });

    it("should send events in correct format (including channel)", function() {
      connection.send_event("test", [1,2,3], "chan");
      expect(transport.send).toHaveBeenCalledWith(JSON.stringify({
        event: "test",
        data: [1,2,3],
        channel: "chan"
      }));
    });
  });

  describe("#close", function() {
    it("should call close on the transport", function() {
      connection.close();
      expect(transport.close).toHaveBeenCalled();
    });
  });

  describe("after receiving 'ping_request' event", function() {
    it("should emit 'ping_request' too", function() {
      var onPingRequest = jasmine.createSpy("onPingRequest");
      connection.bind("ping_request", onPingRequest);

      transport.emit("ping_request");

      expect(onPingRequest).toHaveBeenCalled();
    });
  });

  describe("after receiving a message", function() {
    it("should emit generic messages", function() {
      var onMessage = jasmine.createSpy("onMessage");
      connection.bind("message", onMessage);

      transport.emit("message", {
        data: JSON.stringify({
          event: "random",
          data: { foo: "bar" }
        })
      });
      expect(onMessage).toHaveBeenCalledWith({
        event: "random",
        data: { foo: "bar" }
      });
    });

    it("should emit errors", function() {
      var onError = jasmine.createSpy("onError");
      connection.bind("error", onError);

      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:error",
          data: ":("
        })
      });
      expect(onError).toHaveBeenCalledWith({
        type: "PusherError",
        data: ":("
      });
    });

    it("should emit 'ping'", function() {
      var onPing = jasmine.createSpy("onPing");
      connection.bind("ping", onPing);

      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:ping",
          data: {}
        })
      });
      expect(onPing).toHaveBeenCalled();
    });

    it("should emit 'pong'", function() {
      var onPong = jasmine.createSpy("onPong");
      connection.bind("pong", onPong);

      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:pong",
          data: {}
        })
      });
      expect(onPong).toHaveBeenCalled();
    });

    it("should emit an error after receiving invalid JSON", function() {
      var error = {};

      var onMessage = jasmine.createSpy("onMessage");
      var onError = jasmine.createSpy("onError").andCallFake(function(e) {
        error = e;
      });
      connection.bind("message", onMessage);
      connection.bind("error", onError);

      transport.emit("message", {
        data: "this is not json"
      });
      expect(onMessage).not.toHaveBeenCalled();
      expect(error.type).toEqual("MessageParseError");
      expect(error.data).toEqual("this is not json");
    });
  });

  describe("after transport has closed", function() {
    it("should emit 'closed'", function() {
      var onClosed = jasmine.createSpy("onClosed");
      connection.bind("closed", onClosed);

      transport.emit("closed", { code: 1006, reason: "unknown" });

      expect(onClosed).toHaveBeenCalled();
    });

    it("should 'closed' even if close codes are not supported", function() {
      var onClosed = jasmine.createSpy("onClosed");
      connection.bind("closed", onClosed);

      transport.emit("closed", {});

      expect(onClosed).toHaveBeenCalled();
    });

    it("should emit the action dispatched by protocol", function() {
      var onMockAction = jasmine.createSpy("onMockAction");
      connection.bind("mock_action", onMockAction);
      spyOn(Pusher.Protocol, "getCloseAction").andReturn("mock_action");
      spyOn(Pusher.Protocol, "getCloseError").andReturn(null);

      transport.emit("closed", { code: 1006, reason: "unknown" });

      expect(Pusher.Protocol.getCloseAction).toHaveBeenCalledWith({
        code: 1006,
        reason: "unknown"
      });
      expect(onMockAction).toHaveBeenCalled();
    });

    it("should emit the error returned by protocol", function() {
      var onError = jasmine.createSpy("onError");
      connection.bind("error", onError);
      spyOn(Pusher.Protocol, "getCloseAction").andReturn("mock_action");
      spyOn(Pusher.Protocol, "getCloseError").andReturn({
        type: "MockError",
        data: {
          code: 4123,
          message: "something"
        }
      });

      transport.emit("closed", { code: 4123, reason: "something" });

      expect(Pusher.Protocol.getCloseError).toHaveBeenCalledWith({
        code: 4123,
        reason: "something"
      });
      expect(onError).toHaveBeenCalledWith({
        type: "MockError",
        data: {
          code: 4123,
          message: "something"
        }
      });
    });

    it("should not emit 'error' if close codes are not supported", function() {
      var onError = jasmine.createSpy("onError");
      connection.bind("error", onError);

      transport.emit("closed", {});

      expect(onError).not.toHaveBeenCalled();
    });

    it("should not close the transport", function() {
      transport.emit("closed", { code: 4001, reason: "reason" });

      expect(transport.close).not.toHaveBeenCalled();
    });
  });

  describe("after receiving a transport error", function() {
    it("should emit the error", function() {
      var onError = jasmine.createSpy("onError");
      connection.bind("error", onError);

      transport.emit("error", "wut");
      expect(onError).toHaveBeenCalledWith({
        type: "WebSocketError",
        error: "wut"
      });
    });
  });
});
