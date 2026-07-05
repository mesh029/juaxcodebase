import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleProp, ViewStyle } from 'react-native';
import type { SwipeableService } from '../../hooks/useServiceSwipe';

export type AppIconName =
  | 'laundry'
  | 'stays'
  | 'rides'
  | 'rides-comfort'
  | 'rides-xl'
  | 'mamafua'
  | 'location'
  | 'card'
  | 'bell'
  | 'help'
  | 'car';

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
  stays: { set: 'ionicons', glyph: 'home-outline' },
  rides: { set: 'ionicons', glyph: 'car-outline' },
  'rides-comfort': { set: 'ionicons', glyph: 'car-sport-outline' },
  'rides-xl': { set: 'ionicons', glyph: 'bus-outline' },
  mamafua: { set: 'material', glyph: 'broom' },
  location: { set: 'ionicons', glyph: 'location-outline' },
  card: { set: 'ionicons', glyph: 'card-outline' },
  bell: { set: 'ionicons', glyph: 'notifications-outline' },
  help: { set: 'ionicons', glyph: 'help-circle-outline' },
  car: { set: 'ionicons', glyph: 'car-outline' },
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
