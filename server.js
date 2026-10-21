require('dotenv').config({ override: true });
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const config = require('./src/config/config');
const { setIO } = require('./src/utils/notificationService');
const { EmployeeRepo } = require('./src/repositories');

// ─── HTTP Server ─────────────────────────────────────────────────
const server = http.createServer(app);

// ─── Socket.IO Setup ─────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: config.frontendUrl, methods: ['GET', 'POST'] },
});

// Share io instance globally for controllers
global._io = io;
setIO(io);

const jwt = require('jsonwebtoken');

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    socket.userId = payload.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`[Socket] User ${userId} connected`);

  // Join user's personal room for notifications
  socket.join(`user:${userId}`);

  // Join all group rooms this user is a member of
  const emp = EmployeeRepo.findByUserId(userId);
  if (emp) {
    const { ChatMemberRepo } = require('./src/repositories');
    const memberships = ChatMemberRepo.findByEmployee(emp.id);
    memberships.forEach((m) => socket.join(`group:${m.groupId}`));
  }

  // Handle client joining group
  socket.on('chat:join_group', (groupId) => socket.join(`group:${groupId}`));
  socket.on('chat:leave_group', (groupId) => socket.leave(`group:${groupId}`));

  // Typing indicator
  socket.on('chat:typing', ({ groupId, conversationId, isTyping }) => {
    const emp = EmployeeRepo.findByUserId(userId);
    if (groupId) socket.to(`group:${groupId}`).emit('chat:typing', { userId, employeeName: emp?.name, isTyping });
    if (conversationId) socket.to(`user:${userId}`).emit('chat:typing', { userId, employeeName: emp?.name, isTyping });
  });

  // Online presence
  io.emit('user:online', { userId });

  socket.on('disconnect', () => {
    console.log(`[Socket] User ${userId} disconnected`);
    io.emit('user:offline', { userId });
  });
});

// ─── Scheduled Jobs ──────────────────────────────────────────────
require('./src/jobs/scheduler');

// ─── Seed Database ───────────────────────────────────────────────
require('./src/utils/seed');

// ─── Start Server ────────────────────────────────────────────────
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`\n🚀 TECHSOLVENT OS Backend running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

module.exports = server;
