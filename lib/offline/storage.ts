import AsyncStorage from '@react-native-async-storage/async-storage';

const NS = 'juax:';

export function storageKey(key: string): string {
  return key.startsWith(NS) ? key : `${NS}${key}`;
}

export async function storageGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(key));
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export async function storageRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

export async function storageMultiGet<T extends Record<string, unknown>>(
  keys: (keyof T & string)[],
): Promise<Partial<T>> {
  const out: Partial<T> = {};
  await Promise.all(
    keys.map(async (k) => {
      const v = await storageGet<T[typeof k]>(k);
      if (v != null) out[k] = v;
    }),
  );
  return out;
}
