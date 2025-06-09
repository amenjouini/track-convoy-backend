const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your frontend URL
    methods: ['GET', 'POST']
  }
});

// --- Core Logic ---

// 1. Define the 5 valid codes for your convoy members.
const VALID_CONVOY_CODES = new Set(['1111', '2222', '3333', '4444', '5555']);

// 2. In-memory store for active trackers. We use socket.id as the key.
// { socketId: { name: 'User', lat: 36.8, lng: 10.1 } }
let activeTrackers = {};

io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // This event is ONLY for the public map viewers
  socket.on('subscribe-to-all-locations', () => {
    console.log(`🗺️  A public viewer connected (${socket.id}) and is now watching.`);
    // When a new viewer connects, send them the current locations of all active trackers.
    socket.emit('initial-locations', Object.values(activeTrackers));
  });


  // This event is ONLY for convoy members with a code
  socket.on('start-tracking', ({ code, name }) => {
    // 3. Check if the code is valid
    if (!VALID_CONVOY_CODES.has(code)) {
      // Optional: Send an error back to the user
      socket.emit('auth-error', 'Invalid code.');
      return;
    }

    console.log(`✅ ${name} authenticated with code ${code}. Starting to track.`);
    socket.userName = name; // Store name on the socket instance

    // Optional: Let the user know they are connected successfully
    socket.emit('tracking-started');
  });

  // This event receives location updates from authenticated convoy members
  socket.on('location-update', ({ lat, lng }) => {
    // Only process updates from users who have been authenticated (have a name)
    if (socket.userName) {
      // Add or update the tracker's data
      activeTrackers[socket.id] = {
        name: socket.userName,
        lat,
        lng
      };
      
      // 4. Broadcast the FULL, updated list of trackers to EVERYONE connected.
      // This is simpler and ensures all viewers have the most current data for all users.
      console.log(`📍 Location update from ${socket.userName}: ${lat}, ${lng}`);
      io.emit('locations-updated', Object.values(activeTrackers));
    }
  });


  // When a client disconnects, remove them from the trackers list
  socket.on('disconnect', () => {
    if (activeTrackers[socket.id]) {
      console.log(`❌ Tracker ${activeTrackers[socket.id].name} disconnected.`);
      delete activeTrackers[socket.id];
      
      // Broadcast the new, smaller list of trackers to all viewers
      io.emit('locations-updated', Object.values(activeTrackers));
    } else {
        console.log(`🔌 Client ${socket.id} disconnected.`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});