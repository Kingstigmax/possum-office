const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000"
}));
app.use(express.json());

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user join
  socket.on('user:join', (userData) => {
    users.set(socket.id, {
      ...userData,
      socketId: socket.id,
      voiceEnabled: false // Default voice status
    });
    
    // Send current users to new user
    socket.emit('users:list', Array.from(users.values()));
    
    // Broadcast new user to all other users
    socket.broadcast.emit('user:joined', users.get(socket.id));
    
    // Broadcast office activity to all users
    io.emit('office:activity', {
      type: 'join',
      userName: userData.name,
      timestamp: new Date(),
      message: `${userData.name} entered the office`
    });
    
    console.log('User joined:', userData.name);
  });

  // Handle position updates
  socket.on('user:move', (position) => {
    const user = users.get(socket.id);
    if (user) {
      user.x = position.x;
      user.y = position.y;
      users.set(socket.id, user);
      
      // Broadcast position update to all other users
      socket.broadcast.emit('user:moved', {
        socketId: socket.id,
        x: position.x,
        y: position.y
      });
    }
  });

  // Handle status updates
  socket.on('user:status', (status) => {
    const user = users.get(socket.id);
    if (user) {
      user.status = status;
      users.set(socket.id, user);
      
      // Broadcast status update to all other users
      socket.broadcast.emit('user:status-changed', {
        socketId: socket.id,
        status: status
      });
    }
  });

  // Handle chat messages
  socket.on('chat:message', (messageData) => {
    const user = users.get(socket.id);
    if (user) {
      const message = {
        from: socket.id,
        fromName: user.name,
        message: messageData.message,
        timestamp: new Date()
      };
      
      // Broadcast to all users (global chat)
      io.emit('chat:message', message);
      
      console.log('Chat message from', user.name, ':', messageData.message);
    }
  });

  // Voice chat signaling events
  socket.on('voice:status', (data) => {
    const user = users.get(socket.id);
    if (user) {
      user.voiceEnabled = data.enabled;
      users.set(socket.id, user);
      
      // Broadcast voice status to all other users
      socket.broadcast.emit('voice:status-changed', {
        socketId: socket.id,
        voiceEnabled: data.enabled
      });
      
      // Send confirmation back to sender
      socket.emit('voice:status-updated', {
        socketId: socket.id,
        voiceEnabled: data.enabled
      });
      
      console.log('Voice status changed:', user.name, data.enabled ? 'enabled' : 'disabled');
    }
  });

  // WebRTC signaling - Voice offer
  socket.on('voice:offer', (data) => {
    const { to, offer } = data;
    console.log('Forwarding voice offer from', socket.id, 'to', to);
    
    // Forward offer to target user by their socket ID
    io.to(to).emit('voice:offer', {
      from: socket.id,
      offer: offer
    });
  });

  // WebRTC signaling - Voice answer
  socket.on('voice:answer', (data) => {
    const { to, answer } = data;
    console.log('Forwarding voice answer from', socket.id, 'to', to);
    
    // Forward answer to target user by their socket ID
    io.to(to).emit('voice:answer', {
      from: socket.id,
      answer: answer
    });
  });

  // WebRTC signaling - ICE candidate
  socket.on('voice:ice-candidate', (data) => {
    const { to, candidate } = data;
    console.log('Forwarding ICE candidate from', socket.id, 'to', to);
    
    // Forward ICE candidate to target user by their socket ID
    io.to(to).emit('voice:ice-candidate', {
      from: socket.id,
      candidate: candidate
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log('User disconnected:', user.name);
      
      // Broadcast office activity to all users
      io.emit('office:activity', {
        type: 'leave',
        userName: user.name,
        timestamp: new Date(),
        message: `${user.name} left the office`
      });
      
      // Remove user from users map
      users.delete(socket.id);
      
      // Broadcast user left to all other users
      socket.broadcast.emit('user:left', socket.id);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});