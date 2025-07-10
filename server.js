const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Update CORS for production
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

app.use(express.json());

const httpServer = createServer(app);

// Update the Socket.io CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user joining
  socket.on('user:join', (userData) => {
    users.set(socket.id, { ...userData, socketId: socket.id });
    
    // Send current users to the new user
    socket.emit('users:list', Array.from(users.values()));
    
    // Broadcast new user to others
    socket.broadcast.emit('user:joined', users.get(socket.id));
  });

  // Handle position updates
  socket.on('user:move', (position) => {
    const user = users.get(socket.id);
    if (user) {
      user.x = position.x;
      user.y = position.y;
      socket.broadcast.emit('user:moved', { socketId: socket.id, ...position });
    }
  });

  // Handle status updates
  socket.on('user:status', (status) => {
    const user = users.get(socket.id);
    if (user) {
      user.status = status;
      socket.broadcast.emit('user:status-changed', { socketId: socket.id, status });
    }
  });

  // Global chat message handler
  socket.on('chat:message', (data) => {
    const user = users.get(socket.id);
    const messageData = {
      from: socket.id,
      fromName: data.fromName || user?.name || 'Anonymous',
      message: data.message,
      timestamp: new Date()
    };
    
    console.log(`Global chat from ${messageData.fromName} (${socket.id}): ${data.message}`);
    
    // Broadcast to ALL connected users (including sender)
    io.emit('chat:message', messageData);
  });

  // Global typing indicator (optional future feature)
  socket.on('chat:typing', (data) => {
    const user = users.get(socket.id);
    socket.broadcast.emit('chat:typing', {
      from: socket.id,
      fromName: user?.name || 'Someone',
      isTyping: data.isTyping
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    socket.broadcast.emit('user:left', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});