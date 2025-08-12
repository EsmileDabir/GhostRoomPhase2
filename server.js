const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/chatApp")
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB connection error:", err));

// Message Schema
const messageSchema = new mongoose.Schema({
    socketId: String,
    username: String,
    text: String,
    room: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);

// Track Rooms
let rooms = [
  // Default test room (remove in production)
  { 
    roomId: "123456", 
    admin: "system", 
    members: [] 
  }
];

// Middleware
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    rooms: rooms,
    connections: io.engine.clientsCount,
    mongoConnected: mongoose.connection.readyState === 1
  });
});

// Socket.IO Events
io.on("connection", (socket) => {
    console.log(`🔗 User connected: ${socket.id}`);

    // Send initial room list
    socket.emit("roomList", rooms);

    // Room Creation
    socket.on("create-room", ({ roomId, username }) => {
        if (!/^\d{6}$/.test(roomId)) {
            return socket.emit("errorMessage", "Room ID must be 6 digits");
        }
        
        if (rooms.some(r => r.roomId === roomId)) {
            return socket.emit("errorMessage", "Room already exists");
        }

        const newRoom = {
            roomId,
            admin: username,
            members: [{ socketId: socket.id, username }]
        };
        
        rooms.push(newRoom);
        socket.join(roomId);
        io.emit("roomList", rooms);
        console.log("Created room:", newRoom);
    });

    // Join Room
  socket.on("join-room", async ({ room, name }) => {
    console.log(`Join attempt: ${name} to ${room}`);
    
    // Auto-create room if it doesn't exist (for testing)
    let targetRoom = rooms.find(r => r.roomId === room);
    if (!targetRoom) {
        console.log(`Auto-creating room ${room}`);
        targetRoom = {
            roomId: room,
            admin: "auto-created",
            members: []
        };
        rooms.push(targetRoom);
    }

    socket.join(room);
    targetRoom.members.push({ socketId: socket.id, username: name });
    console.log(`✅ ${name} joined ${room}. Current rooms:`, rooms);

    // Rest of your join-room logic...
});

    // Message Handling
    socket.on("send-message", async ({ room, name, message }) => {
        if (!room || !name || !message.trim()) return;

        // Save to DB
        const newMsg = new Message({
            socketId: socket.id,
            username: name,
            text: message,
            room
        });
        await newMsg.save();

        // Broadcast
        io.to(room).emit("receive-message", { 
            name, 
            message 
        });
    });

    // Disconnect
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        rooms.forEach(r => {
            r.members = r.members.filter(m => m.socketId !== socket.id);
        });
    });
});

// Start Server
const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));