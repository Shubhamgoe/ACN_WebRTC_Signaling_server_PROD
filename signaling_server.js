// const express = require('express');
import express from 'express';
import {Server} from "socket.io";
import cors from "cors";


const app = express();
// app.use(cors());
app.use(cors({ origin: "*" }));

app.get('/', (req, res) => {
    res.send('hello, world');
})

const server = app.listen(4000, () => {
    console.log('server is running on http://localhost:4000')
})

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

let rooms = {};
let socketToRoom = {};

io.on("connection", socket => {
    socket.on("join", data => {
        // console.log("hi");
        // let a new user join to the room
        const roomId = data.room
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;

        // persist the new user in the room
        if (rooms[roomId]) {
            rooms[roomId].push({id: socket.id, name: data.name});
        } else {
            rooms[roomId] = [{id: socket.id, name: data.name}];
        }

        // sends a list of joined users to a new user
        const users = rooms[data.room].filter(user => user.id !== socket.id);
        io.sockets.to(socket.id).emit("room_users", users);
        console.log("[joined] room:" + data.room + " name: " + data.name);
    });


    socket.on("offer", ({ sdp, target }) => {
        console.log("Received Offer SDP from:", socket.id);
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            if (target && io.sockets.sockets.has(target)) {
                // Send the offer directly to the target user
                socket.to(target).emit("getOffer", { sdp, sender: socket.id });
                console.log(`[offer] ${socket.id} -> ${target}`);
                
            } else {
                console.error("Target socket not found or invalid");
            }
        }
    });

    socket.on("answer", ({ sdp, target }) => {
        console.log("Received Answer SDP from:", socket.id);
        if (target && io.sockets.sockets.has(target)) {
          // Send the answer directly to the target user
          socket.to(target).emit("getAnswer", {sdp, sender: socket.id});
          console.log(`[answer] ${socket.id} -> ${target}`);
        } else {
          console.error("Target socket not found or invalid");
        }
    });


    socket.on("candidate", ({ candidate, target }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
          if (target && io.sockets.sockets.has(target)) {
            // Forward the ICE candidate to the target user
            socket.to(target).emit("getCandidate", { candidate, sender: socket.id });
            // console.log(`[candidate] ${socket.id} -> ${target}`);
          } else {
            console.error("Invalid or missing target for candidate:", target);
          }
        } else {
          console.error("Socket not associated with a room:", socket.id);
        }
    });
   

    socket.on("disconnect", () => {
        const roomId = socketToRoom[socket.id];
        let room = rooms[roomId];
        if (room) {
            room = room.filter(user => user.id !== socket.id);
            rooms[roomId] = room;
            socket.broadcast.to(roomId).emit("user_exit", {id: socket.id});
            // Clean up empty rooms
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
            }
            console.log(`[${socketToRoom[socket.id]}]: ${socket.id} exit`);
        }
        delete socketToRoom[socket.id];
    });
});