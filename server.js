require("dotenv").config();
const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const socket = require("socket.io");
const io = socket(server);
const path = require("path");

let rooms = {};

io.on("connection", (socket) => {
  socket.on("join room", (roomID) => {
    if (rooms[roomID]) {
      if (rooms[roomID].length >= 2) {
        socket.emit("room full");
      } else {
        rooms[roomID].push(socket.id);
        const otherUser = rooms[roomID].find((id) => id !== socket.id);
        if (otherUser) {
          socket.emit("other user", otherUser);
          socket.to(otherUser).emit("user joined", socket.id);
        }
      }
    } else {
      rooms[roomID] = [socket.id];
    }
  });

  socket.on("leave room", ({ roomID, otherUser }) => {
    console.log("roomID is: ", roomID);
    console.log("otherUser is: ", otherUser);

    if (rooms[roomID].length === 2) {
      var filtered = rooms[roomID].filter(function (value, index, arr) {
        return value !== socket.id;
      });
      rooms[roomID] = filtered;

      console.log("rooms is: ", rooms);
      socket.to(otherUser).emit("user left");
    } else if (rooms[roomID].length === 1) {
      var filtered = rooms[roomID].filter(function (value, index, arr) {
        return value !== socket.id;
      });
      rooms[roomID] = filtered;

      delete rooms[roomID];

      console.log("rooms is: ", rooms);
    }
  });

  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming.candidate);
  });
});

if (process.env.PROD) {
  app.use(express.static(path.join(__dirname, "./client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "./client/build/index.html"));
  });
}

const port = process.env.PORT || 8000;
server.listen(port, () => console.log(`server is running on port ${port}`));
