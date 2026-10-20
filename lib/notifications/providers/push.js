import { Expo } from 'expo-server-sdk';
import { assertProvider } from './provider.js';

const expo = new Expo();

export function isExpoPushToken(token) {
  return Expo.isExpoPushToken(token);
}

/**
 * Expo push provider (existing push channel, now behind the provider contract).
 * `to` is an array of Expo push tokens.
 */
export function createPushProvider() {
  return assertProvider({
    channel: 'push',
    async send({ to, notification }) {
      const tokens = (Array.isArray(to) ? to : [to]).filter((t) => Expo.isExpoPushToken(t));
      if (!tokens.length) throw new Error('no_device_token');

      const messages = tokens.map((token) => ({
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.payload,
      }));

      let messageId = null;
      for (const chunk of expo.chunkPushNotifications(messages)) {
        const receipts = await expo.sendPushNotificationsAsync(chunk);
        const ticket = (receipts || []).find((r) => r?.status === 'error') || (receipts || [])[0];
        if (ticket?.status === 'error') {
          const err = new Error(ticket.message || ticket.details?.error || 'expo_push_error');
          err.status = 400; // Expo reports invalid tokens as permanent errors
          throw err;
        }
        messageId = messageId || ticket?.id || null;
      }

      return { messageId };
    },
  });
}
