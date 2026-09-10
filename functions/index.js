const { onValueCreated } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

exports.notifyFriendChatMessage = onValueCreated(
  { ref: '/friendChats/{chatId}/messages/{messageId}', region: 'europe-west1' },
  async (event) => {
    const message = event.data.val() || {};
    const chatId = String(event.params.chatId || '');
    const senderId = String(message.senderId || '');
    const messageId = String(event.params.messageId || '');
    if (!senderId || !chatId || !message.text) return null;

    const participants = chatId.split('__').filter(Boolean);
    const recipientId = participants.find((id) => id !== senderId);
    if (!recipientId) return null;

    const snapshot = await getDatabase().ref(`users/${recipientId}/fcmTokens`).get();
    const tokenEntries = snapshot.val() || {};
    const tokens = Object.values(tokenEntries)
      .map((item) => typeof item === 'string' ? item : item && item.token)
      .filter(Boolean);
    if (!tokens.length) return null;

    const senderName = String(message.senderName || 'صديقك');
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        title: '💬 رسالة خاصة جديدة',
        body: `${senderName}: ${String(message.text).slice(0, 180)}`,
        senderId,
        senderName,
        chatId,
        messageId,
        timestamp: String(message.timestamp || Date.now()),
        icon: 'friend-chat-notification.svg',
        badge: 'friend-chat-notification.svg',
        url: './Test.html'
      }
    });

    const staleTokens = [];
    response.responses.forEach((result, index) => {
      const code = result.error && result.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        staleTokens.push(tokens[index]);
      }
    });
    if (staleTokens.length) {
      const cleanup = {};
      Object.entries(tokenEntries).forEach(([key, item]) => {
        const token = typeof item === 'string' ? item : item && item.token;
        if (staleTokens.includes(token)) cleanup[key] = null;
      });
      await getDatabase().ref(`users/${recipientId}/fcmTokens`).update(cleanup);
    }
    return null;
  }
);
