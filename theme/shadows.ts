import { Colors } from './colors';

/**
 * iOS shadow + Android elevation pairs.
 * MCP: theme://shadows
 */
export const Shadows = {
  card: {
    shadowColor: '#1C0F08',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 12,
  },
  cta: {
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;
