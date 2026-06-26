/**
 * Easy Ride UI Kit tokens — adapted for Jua X (VALET · SAKA KEJA · RIDES).
 * Source: https://www.figma.com/design/ZKEZpkCoHuV5gD6sWlUA5G/Easy-Ride--Taxi-Booking-App-UI-Kit
 */
export const EASY_RIDE = {
  primary: '#FEC400',
  primaryDark: '#FBC02D',
  primaryLight: '#FFF9C4',
  primaryBorder: '#FEF075',
  teal: '#0B8783',
  success: '#43A047',
  error: '#F44336',
  black: '#121212',
  white: '#FFFFFF',
  gray: {
    50: '#F7F7F7',
    100: '#E8E8E8',
    200: '#D0D0D0',
    300: '#B8B8B8',
    400: '#A0A0A0',
    500: '#898989',
    600: '#717171',
    700: '#5A5A5A',
    800: '#414141',
    900: '#2A2A2A',
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    pill: 999,
  },
  shadow: {
    card: {
      shadowColor: '#4D4D4D',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 6,
    },
    sheet: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 16,
    },
  },
} as const;
