const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const VALID_CONVOY_CODES = new Set(['1111', '2222', '3333', '4444', '5555']);

// Data structure: { socketId: { name: 'User', path: [...], danger: false } }
let activeTrackers = {};

io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);
  
  socket.on('subscribe-to-all-locations', () => {
    console.log(`🗺️  A viewer connected (${socket.id}).`);
    socket.emit('initial-locations', Object.values(activeTrackers));
  });

  socket.on('start-tracking', ({ code, name }) => {
    if (!VALID_CONVOY_CODES.has(code)) {
      socket.emit('auth-error', 'Invalid code.');
      return;
    }
    console.log(`✅ ${name} (${socket.id}) authenticated.`);
    
    activeTrackers[socket.id] = {
        name: name,
        path: [],
        danger: false // Start with no danger
    };
    
    socket.emit('tracking-started', { socketId: socket.id });
    io.emit('locations-updated', Object.values(activeTrackers));
  });

  socket.on('location-update', (data, callback) => {
    const tracker = activeTrackers[socket.id];
    if (!tracker) return;

    const locations = Array.isArray(data) ? data : [data];
    locations.forEach(location => {
        if(location.lat && location.lng) {
            tracker.path.push({ lat: location.lat, lng: location.lng });
        }
    });

    io.emit('locations-updated', Object.values(activeTrackers));

    if (typeof callback === 'function') {
        callback({ status: 'ok' });
    }
  });

  socket.on('danger-signal', () => {
    if (activeTrackers[socket.id]) {
        const name = activeTrackers[socket.id].name;
        console.log(`🚨 DANGER SIGNAL RECEIVED from ${name} (${socket.id})!`);
        activeTrackers[socket.id].danger = true;
        io.emit('locations-updated', Object.values(activeTrackers));
    }
  });

  socket.on('disconnect', () => {
    if (activeTrackers[socket.id]) {
      console.log(`❌ Tracker ${activeTrackers[socket.id].name} disconnected.`);
      delete activeTrackers[socket.id];
      io.emit('locations-updated', Object.values(activeTrackers));
    } else {
      console.log(`🔌 Client ${socket.id} disconnected.`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
