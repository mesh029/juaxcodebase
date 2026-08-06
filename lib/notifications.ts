import { Platform } from 'react-native';
import { ApiError, registerDeviceToken } from './api';
import { checkApiHealth } from './offline/health';
import { enqueueMutation } from './offline/sync';

type NotificationsModule = typeof import('expo-notifications');

let Notifications: NotificationsModule | null = null;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    return Notifications;
  } catch {
    return null;
  }
}

export async function initPushNotifications(): Promise<void> {
  const mod = await loadNotifications();
  if (!mod) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    /* ignore */
  }
}

/** Register Expo push token with backend, or outbox when API down. */
export async function registerPushDeviceToken(): Promise<string | null> {
  const mod = await loadNotifications();
  if (!mod) return null;

  try {
    const { status: existing } = await mod.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await mod.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const tokenRes = await mod.getExpoPushTokenAsync();
    const token = tokenRes.data;
    const platform = Platform.OS;
    const health = await checkApiHealth();
    if (health === 'up') {
      try {
        await registerDeviceToken({ token, platform });
        return token;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) {
          await enqueueMutation(
            'device_token',
            { token, platform },
            { dedupeKey: `device_token:${token}` },
          );
        }
        return token;
      }
    }
    await enqueueMutation('device_token', { token, platform }, { dedupeKey: `device_token:${token}` });
    return token;
  } catch {
    return null;
  }
}

export type NotificationNavTarget = {
  tab?: 'home' | 'activity' | 'profile';
  deep?: string;
};

export function parseNotificationData(data: Record<string, unknown> | undefined): NotificationNavTarget {
  if (!data) return {};
  const tab = data.tab === 'activity' || data.tab === 'profile' || data.tab === 'home' ? data.tab : undefined;
  const deep = typeof data.deep === 'string' ? data.deep : undefined;
  return { tab, deep };
}
