import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleProp, ViewStyle } from 'react-native';
import type { SwipeableService } from '../../hooks/useServiceSwipe';

export type AppIconName =
  | 'laundry'
  | 'washer'
  | 'stays'
  | 'home'
  | 'rides'
  | 'rides-comfort'
  | 'rides-xl'
  | 'mamafua'
  | 'movers'
  | 'tours'
  | 'spots'
  | 'events'
  | 'cloth'
  | 'grocery'
  | 'location'
  | 'card'
  | 'bell'
  | 'help'
  | 'car'
  | 'more'
  | 'person'
  | 'history';

type Props = {
  name: AppIconName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
};

type IconSpec =
  | { set: 'ionicons'; glyph: keyof typeof Ionicons.glyphMap }
  | { set: 'material'; glyph: keyof typeof MaterialCommunityIcons.glyphMap };

const ICONS: Record<AppIconName, IconSpec> = {
  laundry: { set: 'ionicons', glyph: 'shirt-outline' },
  washer: { set: 'material', glyph: 'washing-machine' },
  stays: { set: 'ionicons', glyph: 'home-outline' },
  home: { set: 'material', glyph: 'home-city-outline' },
  rides: { set: 'ionicons', glyph: 'car-outline' },
  'rides-comfort': { set: 'ionicons', glyph: 'car-sport-outline' },
  'rides-xl': { set: 'ionicons', glyph: 'bus-outline' },
  mamafua: { set: 'material', glyph: 'broom' },
  movers: { set: 'material', glyph: 'truck-outline' },
  tours: { set: 'ionicons', glyph: 'compass-outline' },
  spots: { set: 'ionicons', glyph: 'sparkles-outline' },
  events: { set: 'ionicons', glyph: 'ticket-outline' },
  cloth: { set: 'material', glyph: 'hanger' },
  grocery: { set: 'ionicons', glyph: 'basket-outline' },
  location: { set: 'ionicons', glyph: 'location-outline' },
  card: { set: 'ionicons', glyph: 'card-outline' },
  bell: { set: 'ionicons', glyph: 'notifications-outline' },
  help: { set: 'ionicons', glyph: 'help-circle-outline' },
  car: { set: 'ionicons', glyph: 'car-outline' },
  more: { set: 'ionicons', glyph: 'grid-outline' },
  person: { set: 'ionicons', glyph: 'person-outline' },
  history: { set: 'ionicons', glyph: 'time-outline' },
};

export function AppIcon({ name, size = 22, color, style }: Props) {
  const spec = ICONS[name];
  if (spec.set === 'material') {
    return <MaterialCommunityIcons name={spec.glyph} size={size} color={color} style={style} />;
  }
  return <Ionicons name={spec.glyph} size={size} color={color} style={style} />;
}

export function serviceIconName(service: SwipeableService): AppIconName {
  if (service === 'laundry') return 'laundry';
  if (service === 'bnbs') return 'stays';
  return 'rides';
}

export function homeQuickIconName(service: SwipeableService | 'movers' | 'more'): AppIconName {
  if (service === 'laundry') return 'washer';
  if (service === 'bnbs') return 'home';
  if (service === 'movers') return 'movers';
  if (service === 'more') return 'more';
  return 'rides';
}
