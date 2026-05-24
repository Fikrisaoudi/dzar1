const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

const waitingUsers = [];
const partners = new Map();
const profiles = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

function publicUser(socketId) {
  const profile = profiles.get(socketId) || {};
  return {
    id: socketId,
    name: profile.name || "Guest",
    region: profile.region || "Somewhere"
  };
}

function removeFromQueue(socketId) {
  const index = waitingUsers.indexOf(socketId);
  if (index !== -1) {
    waitingUsers.splice(index, 1);
  }
}

function endMatch(socket, reason = "partner-left") {
  const partnerId = partners.get(socket.id);
  removeFromQueue(socket.id);

  if (!partnerId) {
    return;
  }

  partners.delete(socket.id);
  partners.delete(partnerId);
  removeFromQueue(partnerId);

  const partnerSocket = io.sockets.sockets.get(partnerId);
  if (partnerSocket) {
    partnerSocket.emit("match-ended", { reason });
  }
}

function matchUsers() {
  while (waitingUsers.length >= 2) {
    const callerId = waitingUsers.shift();
    const calleeId = waitingUsers.shift();

    const caller = io.sockets.sockets.get(callerId);
    const callee = io.sockets.sockets.get(calleeId);

    if (!caller || !callee || callerId === calleeId) {
      continue;
    }

    partners.set(callerId, calleeId);
    partners.set(calleeId, callerId);

    caller.emit("matched", {
      role: "caller",
      peer: publicUser(calleeId)
    });
    callee.emit("matched", {
      role: "callee",
      peer: publicUser(callerId)
    });
  }
}

io.on("connection", (socket) => {
  socket.emit("connected", { id: socket.id });

  socket.on("profile", (profile = {}) => {
    profiles.set(socket.id, {
      name: String(profile.name || "Guest").slice(0, 24),
      region: String(profile.region || "Somewhere").slice(0, 32)
    });
  });

  socket.on("find-match", () => {
    endMatch(socket, "new-search");

    if (!waitingUsers.includes(socket.id)) {
      waitingUsers.push(socket.id);
    }

    socket.emit("queued", { position: waitingUsers.indexOf(socket.id) + 1 });
    matchUsers();
  });

  socket.on("cancel-search", () => {
    removeFromQueue(socket.id);
    socket.emit("idle");
  });

  socket.on("skip", () => {
    endMatch(socket, "skipped");
    if (!waitingUsers.includes(socket.id)) {
      waitingUsers.push(socket.id);
    }
    socket.emit("queued", { position: waitingUsers.indexOf(socket.id) + 1 });
    matchUsers();
  });

  socket.on("leave-call", () => {
    endMatch(socket, "partner-left");
    socket.emit("idle");
  });

  socket.on("signal", (payload) => {
    const partnerId = partners.get(socket.id);
    if (!partnerId) {
      return;
    }

    io.to(partnerId).emit("signal", {
      from: socket.id,
      data: payload
    });
  });

  socket.on("disconnect", () => {
    endMatch(socket, "partner-left");
    removeFromQueue(socket.id);
    profiles.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Voice Match is running on port ${PORT}`);
});
