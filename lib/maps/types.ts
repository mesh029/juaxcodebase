export type Coordinates = { latitude: number; longitude: number };

export type MapPointKind = 'station' | 'bnb' | 'house' | 'ride';

export type MapPointPayload = {
  id: string;
  title: string;
  subtitle: string;
  coords: Coordinates;
  kind: MapPointKind;
};

export type MapViewportPad = { top: number; bottom: number; left: number; right: number };

export type InteractiveMapOptions = {
  laundryStationPick?: boolean;
  selectedHighlight?: Coordinates | null;
  mapViewportPad?: MapViewportPad | null;
};

export type GuidanceUiTheme = {
  canvas: string;
  surface: string;
  text: string;
  textMuted: string;
  gold: string;
  isDark: boolean;
};
