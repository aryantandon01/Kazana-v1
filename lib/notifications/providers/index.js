import { createPushProvider, isExpoPushToken } from './push.js';
import { createWhatsAppProvider, isWhatsAppConfigured } from './whatsapp.js';

/**
 * Channel → provider factory registry. Adding a channel means adding one entry
 * here; the worker never needs to know which vendor backs a channel.
 */
const registry = {
  push: () => createPushProvider(),
  whatsapp: (options) => createWhatsAppProvider(options),
};

export function getProvider(channel, options) {
  const factory = registry[channel];
  if (!factory) throw new Error(`unknown_channel:${channel}`);
  return factory(options);
}

export function hasProvider(channel) {
  return Boolean(registry[channel]);
}

export function supportedChannels() {
  return Object.keys(registry);
}

export { createPushProvider, createWhatsAppProvider, isExpoPushToken, isWhatsAppConfigured };
