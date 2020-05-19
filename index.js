// Setup basic express server
var express = require("express");
var app = express();
var server = require("http").createServer(app);
var io = require("socket.io")(server);
var port = process.env.PORT || 3000;

server.listen(port, function() {
  console.log("Server listening at port %d", port);
});
const config = require("./config");
// Routing
app.use(express.static("public"));

// Chunk sender
var connected = [];
var connections = [];
var crypto = require("crypto");
var waiting = {};
io.on("connection", function(socket) {
  connected.push(socket);
  socket.on("disconnect", function(data) {
    connected = connected.filter(x => x != socket);
  });
  // when the client emits 'new message', this listens and executes
  socket.on("askforchunk", function(data) {
    // we tell the client to execute 'new message'
    console.log("Asking for chunk " + data.chunkhash);
    io.sockets.emit("requestchunk", {
      hash: data.chunkhash
    });
    if (waiting[data.chunkhash]) {
      waiting[data.chunkhash].push(socket);
    } else {
      waiting[data.chunkhash] = [socket];
    }
  });

  socket.on("gotchunk", function(data) {
    var buffer = data.rawdata;
    let h = crypto.createHash("sha1");
    h.update(buffer);
    let hash = h.digest("hex");
    if (hash != data.hash) {
      console.log(
        "Corrupt forwarding data detected " + hash + " is not" + data.hash
      );
      console.log(buffer);
      return;
    }
    console.log("Recieved and verified chunk " + hash);
    if (Object.keys(waiting).includes(hash)) {
      for (let i = 0; i < waiting[hash].length; i++) {
        waiting[hash][i].emit("hashretrieved", {
          rawdata: buffer,
          hash: hash
        });
      }
      delete waiting[hash];
    } else {
      console.log("Someone already sent the hash you were too late. ");
    }
  });
  socket.on("distchunk", function(data) {
    let buffer = data.rawdata;
    let h = crypto.createHash("sha1");
    h.update(buffer);
    console.log(typeof buffer);
    let hash = h.digest("hex");
    if (hash != data.hash) {
      console.log("Corrupt sent dist detected for " + data.hash);
      console.log(
        data.hash +
          " is not the same as " +
          hash +
          " length " +
          buffer.length
      );
      console.log(buffer);
      return;
    }
    console.log("Chunk verified ready to send");
    if (connected.length == 0) {
      console.warn("Send and disconnect?");
      return;
    }
    for (var i = 0; i < config.DIST_TIMES; i++) {
      connected[Math.floor(Math.random() * connected.length)].emit(
        "distribution",
        data,
        function(err) {
          console.log(err);
        }
      );
    }
    console.log("Dist finsihed for hash " + data.hash);
  });
});
