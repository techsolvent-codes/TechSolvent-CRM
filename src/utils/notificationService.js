const { NotificationRepo } = require('../repositories');
const pushService = require('./pushService');

// In-memory reference to Socket.IO instance
let _io = null;

function setIO(io) {
  _io = io;
}

/**
 * Create an in-app notification and emit it over WebSocket if user is online,
 * plus send native Web Push notification to any registered devices.
 */
async function notify({ userId, title, message, type = 'info', link = null, referenceId = null, referenceType = null }) {
  const notification = NotificationRepo.create({
    userId,
    title,
    message,
    type,
    link,
    referenceId,
    referenceType,
    read: false,
  });

  // Emit via Socket.IO to the user's room
  if (_io) {
    _io.to(`user:${userId}`).emit('notification', notification);
  }

  // Dispatch Web Push notification (works when browser tab is closed)
  try {
    pushService.sendToUser(userId, {
      title,
      message,
      link,
      type,
      referenceId,
      referenceType,
    }).catch((err) => {
      console.warn('[NotificationService] Push notification failed:', err.message);
    });
  } catch (err) {
    console.warn('[NotificationService] Error triggering push notification:', err.message);
  }

  return notification;
}

/**
 * Notify multiple users
 */
async function notifyMany(userIds, payload) {
  return Promise.all(userIds.map((uid) => notify({ ...payload, userId: uid })));
}

module.exports = { setIO, notify, notifyMany };
