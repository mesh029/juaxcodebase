import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

type Coordinates = { latitude: number; longitude: number };

function safeCoords(coords: Coordinates | undefined | null): Coordinates | null {
  if (!coords) return null;
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

type Theme = {
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  mutedSurface: string;
};

type Props = {
  title: string;
  coords: Coordinates;
  unlocked: boolean;
  theme: Theme;
  onNavigate: () => void;
  onRequestRide: () => void;
  navigateDisabled?: boolean;
};

export function ListingLocationActions({
  title,
  coords,
  unlocked,
  theme,
  onNavigate,
  onRequestRide,
  navigateDisabled,
}: Props) {
  const safe = safeCoords(coords);
  if (!unlocked || !safe) return null;

  const coordLabel = `${safe.latitude.toFixed(5)}, ${safe.longitude.toFixed(5)}`;

  const shareCoords = async () => {
    const mapsUrl =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?ll=${safe.latitude},${safe.longitude}&q=${encodeURIComponent(title)}`
        : `https://www.google.com/maps/search/?api=1&query=${safe.latitude},${safe.longitude}`;
    try {
      await Share.share({
        message: `${title}\n${coordLabel}\n${mapsUrl}`,
        title: 'Listing coordinates',
      });
    } catch {
      /* user dismissed */
    }
  };

  const openExternalMaps = () => {
    const url =
      Platform.OS === 'ios'
        ? `maps://?daddr=${safe.latitude},${safe.longitude}`
        : `geo:${safe.latitude},${safe.longitude}?q=${safe.latitude},${safe.longitude}(${encodeURIComponent(title)})`;
    void Linking.openURL(url).catch(() => {
      void Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${safe.latitude},${safe.longitude}`,
      );
    });
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.textPrimary }]}>Getting there</Text>
      <Text style={[styles.coords, { color: theme.textSecondary }]} selectable>
        {coordLabel}
      </Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.btn, { borderColor: theme.primary }]}
          onPress={onNavigate}
          disabled={navigateDisabled}
        >
          <Text style={[styles.btnText, { color: theme.primary }]}>Navigate in app</Text>
        </Pressable>
        <Pressable style={[styles.btn, { borderColor: theme.border }]} onPress={() => void shareCoords()}>
          <Text style={[styles.btnText, { color: theme.textPrimary }]}>Share coords</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={[styles.btn, { borderColor: theme.border }]} onPress={openExternalMaps}>
          <Text style={[styles.btnText, { color: theme.textPrimary }]}>Open in Maps</Text>
        </Pressable>
        <Pressable style={[styles.btn, { borderColor: theme.border }]} onPress={onRequestRide}>
          <Text style={[styles.btnText, { color: theme.textPrimary }]}>Request ride</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 8,
    gap: 8,
  },
  label: { fontSize: 15, fontWeight: '700' },
  coords: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '600' },
});
