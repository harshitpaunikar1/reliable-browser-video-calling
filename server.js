/**
 * WebRTC signaling server for reliable one-to-one browser video calling.
 * Handles room joins, offer-answer exchange, ICE candidates, and connection state.
 * Requires Node.js, socket.io, express.
 */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");

let express, socketIo;
try {
  express = require("express");
  socketIo = require("socket.io");
} catch (e) {
  console.error("Missing deps: npm install express socket.io");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const MAX_ROOM_SIZE = 2;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Room state: roomId -> Set of socket ids
const rooms = new Map();

// ICE server config: STUN + optional TURN
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Add TURN server only from environment variables, never hardcoded
if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  ICE_SERVERS.push({
    urls: process.env.TURN_URL,
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}

function getRoomPeer(roomId, excludeSocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const id of room) {
    if (id !== excludeSocketId) return id;
  }
  return null;
}

function logRoom(roomId) {
  const room = rooms.get(roomId);
  const size = room ? room.size : 0;
  console.log(`[room:${roomId}] size=${size}`);
}

io.on("connection", (socket) => {
  console.log(`[connect] socket=${socket.id}`);

  // Client requests to join a named room
  socket.on("join", ({ roomId }) => {
    if (!roomId || typeof roomId !== "string") {
      socket.emit("error", { message: "Invalid room ID." });
      return;
    }

    const sanitizedRoom = roomId.trim().replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 64);
    if (!sanitizedRoom) {
      socket.emit("error", { message: "Room ID contains invalid characters." });
      return;
    }

    if (!rooms.has(sanitizedRoom)) {
      rooms.set(sanitizedRoom, new Set());
    }

    const room = rooms.get(sanitizedRoom);

    if (room.size >= MAX_ROOM_SIZE) {
      socket.emit("room_full", { roomId: sanitizedRoom });
      return;
    }

    room.add(socket.id);
    socket.join(sanitizedRoom);
    socket.data.roomId = sanitizedRoom;

    const isInitiator = room.size === 1;
    socket.emit("joined", {
      roomId: sanitizedRoom,
      isInitiator,
      iceServers: ICE_SERVERS,
      peerId: getRoomPeer(sanitizedRoom, socket.id),
    });

    if (!isInitiator) {
      const peerId = getRoomPeer(sanitizedRoom, socket.id);
      if (peerId) {
        io.to(peerId).emit("peer_joined", { peerId: socket.id });
      }
    }

    logRoom(sanitizedRoom);
    console.log(`[join] socket=${socket.id} room=${sanitizedRoom} initiator=${isInitiator}`);
  });

  // Relay WebRTC offer to the peer in the same room
  socket.on("offer", ({ offer }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const peerId = getRoomPeer(roomId, socket.id);
    if (!peerId) return;
    io.to(peerId).emit("offer", { offer, from: socket.id });
    console.log(`[offer] ${socket.id} -> ${peerId}`);
  });

  // Relay WebRTC answer
  socket.on("answer", ({ answer }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const peerId = getRoomPeer(roomId, socket.id);
    if (!peerId) return;
    io.to(peerId).emit("answer", { answer, from: socket.id });
    console.log(`[answer] ${socket.id} -> ${peerId}`);
  });

  // Relay ICE candidate
  socket.on("ice_candidate", ({ candidate }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const peerId = getRoomPeer(roomId, socket.id);
    if (!peerId) return;
    io.to(peerId).emit("ice_candidate", { candidate, from: socket.id });
  });

  // Connection state reporting for diagnostics
  socket.on("connection_state", ({ state }) => {
    const roomId = socket.data.roomId;
    console.log(`[state] socket=${socket.id} room=${roomId} state=${state}`);
    const peerId = getRoomPeer(roomId, socket.id);
    if (peerId) {
      io.to(peerId).emit("peer_state", { state, from: socket.id });
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
        console.log(`[room:${roomId}] destroyed (empty)`);
      } else {
        const peerId = getRoomPeer(roomId, socket.id);
        if (peerId) {
          io.to(peerId).emit("peer_disconnected", { peerId: socket.id });
        }
        logRoom(roomId);
      }
    }
    console.log(`[disconnect] socket=${socket.id}`);
  });
});

// Serve static client files if present
const staticDir = path.join(__dirname, "public");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    activeRooms: rooms.size,
    timestamp: Date.now(),
  });
});

app.get("/rooms", (req, res) => {
  const summary = [];
  rooms.forEach((participants, roomId) => {
    summary.push({ roomId, participants: participants.size });
  });
  res.json(summary);
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`TURN configured: ${ICE_SERVERS.length > 2 ? "yes" : "no (STUN only)"}`);
});

module.exports = { app, server, io };
