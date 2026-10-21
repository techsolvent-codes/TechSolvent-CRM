const webpush = require('web-push');
const config = require('../config/config');
const { PushSubscriptionRepo } = require('../repositories');

let isVapidConfigured = false;

function initVapid() {
  if (config.vapid?.publicKey && config.vapid?.privateKey) {
    try {
      webpush.setVapidDetails(
        config.vapid.email || 'mailto:crm@techsolvent.in',
        config.vapid.publicKey,
        config.vapid.privateKey
      );
      isVapidConfigured = true;
    } catch (err) {
      console.error('[PushService] Failed to initialize VAPID details:', err.message);
    }
  } else {
    console.warn('[PushService] VAPID keys not configured. Web Push notifications disabled.');
  }
}

initVapid();

/**
 * Send a web push notification to a specific subscription
 */
async function sendToSubscription(subRecord, payload) {
  if (!isVapidConfigured) {
    initVapid();
    if (!isVapidConfigured) return false;
  }

  const { subscription } = subRecord;
  if (!subscription || !subscription.endpoint) return false;

  const pushPayload = JSON.stringify({
    title: payload.title || 'TECHSOLVENT OS',
    body: payload.message || payload.body || 'You have a new update.',
    icon: payload.icon || '/icon.png',
    badge: payload.badge || '/icon.png',
    url: payload.link || payload.url || '/tasks',
    data: {
      url: payload.link || payload.url || '/tasks',
      type: payload.type || 'info',
      referenceId: payload.referenceId || null,
      timestamp: new Date().toISOString(),
    },
  });

  try {
    await webpush.sendNotification(subscription, pushPayload);
    return true;
  } catch (err) {
    console.warn(`[PushService] Push failed for endpoint (${subRecord.id}): ${err.statusCode} - ${err.message}`);
    // 410 Gone or 404 means the subscription has expired or unsubscribed
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log(`[PushService] Removing expired subscription ${subRecord.id}`);
      PushSubscriptionRepo.removeByEndpoint(subscription.endpoint);
    }
    return false;
  }
}

/**
 * Send web push notification to all active devices registered to a user
 */
async function sendToUser(userId, payload) {
  try {
    const subscriptions = PushSubscriptionRepo.findByUser(userId);
    if (!subscriptions || subscriptions.length === 0) return [];

    const results = await Promise.all(
      subscriptions.map((sub) => sendToSubscription(sub, payload))
    );
    return results;
  } catch (err) {
    console.error(`[PushService] Error sending push to user ${userId}:`, err.message);
    return [];
  }
}

/**
 * Send web push notification to multiple users
 */
async function sendToMany(userIds, payload) {
  if (!Array.isArray(userIds)) return [];
  return Promise.all(userIds.map((uid) => sendToUser(uid, payload)));
}

module.exports = {
  getPublicKey: () => config.vapid.publicKey,
  sendToSubscription,
  sendToUser,
  sendToMany,
};
