const { NotificationRepo, PushSubscriptionRepo, EmployeeRepo } = require('../repositories');
const pushService = require('../utils/pushService');

const notificationController = {
  getMyNotifications: (req, res) => {
    const notifs = NotificationRepo.findByUser(req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: notifs });
  },

  markRead: (req, res, next) => {
    try {
      const notif = NotificationRepo.findById(req.params.id);
      if (!notif || notif.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Notification not found' });
      const updated = NotificationRepo.update(req.params.id, { read: true });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  markAllRead: (req, res, next) => {
    try {
      NotificationRepo.markAllRead(req.user.id);
      res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) { next(err); }
  },

  getUnreadCount: (req, res) => {
    const count = NotificationRepo.findByUser(req.user.id).filter((n) => !n.read).length;
    res.json({ success: true, data: { count } });
  },

  // ─── Web Push (PWA) ────────────────────────────────────────────────
  getVapidPublicKey: (req, res) => {
    const publicKey = pushService.getPublicKey();
    res.json({ success: true, data: { publicKey } });
  },

  subscribePush: async (req, res, next) => {
    try {
      const { subscription } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, message: 'Invalid subscription object' });
      }

      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const saved = PushSubscriptionRepo.saveSubscription({
        userId: req.user.id,
        subscription,
        userAgent,
      });

      res.status(201).json({ success: true, message: 'Push subscription registered', data: saved });
    } catch (err) {
      next(err);
    }
  },

  unsubscribePush: async (req, res, next) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ success: false, message: 'Endpoint required' });
      }

      PushSubscriptionRepo.removeByEndpoint(endpoint);
      res.json({ success: true, message: 'Push subscription removed' });
    } catch (err) {
      next(err);
    }
  },

  testPush: async (req, res, next) => {
    try {
      const results = await pushService.sendToUser(req.user.id, {
        title: '🔔 Test Notification',
        message: `Hello ${req.user.name || 'there'}! Web Push alerts are active and working.`,
        link: '/tasks',
        type: 'info',
      });

      const successCount = results.filter(Boolean).length;
      res.json({
        success: true,
        message: successCount > 0 
          ? `Sent test push to ${successCount} device(s)` 
          : 'No active device subscription found for your account. Click "Enable Push" to register this device.',
        data: { dispatchedDevices: successCount },
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = notificationController;
