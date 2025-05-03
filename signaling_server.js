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

const server = app.listen(4000, '0.0.0.0', () => {
    console.log('server is running on port 4000');
});

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

    socket.on("media_state_change", ({ userId, senderid, audio, video }) => {
        const roomId = socketToRoom[socket.id];
        
        if (roomId) {
            // Update the user's media state in the rooms object
            if (userId != "send_to_all"){
                const user = rooms[roomId]?.find(u => u.id === userId);
                if (user) {
                    user.audio = audio;
                    user.video = video;
                }
                console.log(`[media_state_change] ${senderid} audio: ${audio}, video: ${video}`);
            }
            
            // Broadcast the media state change to all users in the room
            socket.broadcast.to(roomId).emit("media_state_change", {
                sender: senderid,
                audio,
                video
            });
        }
    });

    socket.on("request_media_state", ({ target }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && target) {
            // Forward the request to the target user
            socket.to(target).emit("request_media_state", { sender: socket.id });
        }
    });

    socket.on("chat_message", (message) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            // Broadcast the message to all users in the room
            socket.broadcast.to(roomId).emit("chat_message", {
                ...message,
                sender: socket.id,
                senderName: message.senderName || `User-${socket.id.slice(0, 6)}`
            });
        }
    });

    socket.on("media_state_request", ({ target }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId && target) {
            // Forward the request to the target user
            socket.to(target).emit("media_state_request", { requesterid: socket.id });
        }
    });

    // On your signaling server
    socket.on("video_mute_request", ({ target, shouldMute }) => {
        socket.to(target).emit("video_mute_request", { 
        sender: socket.id, 
        shouldMute 
        });
    });
    
    socket.on("video_mute_response", ({ target, muted }) => {
        socket.to(target).emit("video_mute_response", { 
        sender: socket.id, 
        muted 
        });
    });
});
