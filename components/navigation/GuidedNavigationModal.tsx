import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Coordinates = { latitude: number; longitude: number };

export type GuidedJourneyRoute = {
  origin: Coordinates;
  end: Coordinates;
  title: string;
  subtitle: string;
};

type Theme = {
  canvas: string;
  sheet: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
};

type Props = {
  visible: boolean;
  journey: GuidedJourneyRoute | null;
  guidanceMapHtml: string | null;
  theme: Theme;
  gold: string;
  topInset: number;
  horizontalPad: number;
  onClose: () => void;
};

/** In-app route preview (Mapbox GL in WebView). Native Navigation SDK is production-only. */
export function GuidedNavigationModal({
  visible,
  journey,
  guidanceMapHtml,
  theme,
  gold,
  topInset,
  horizontalPad,
  onClose,
}: Props) {
  const canShow = Boolean(visible && journey && guidanceMapHtml);
  if (!canShow || !journey || !guidanceMapHtml) return null;

  return (
    <Modal visible={canShow} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.canvas }]}>
        <View
          style={[
            styles.topBar,
            { paddingTop: topInset + 8, paddingHorizontal: horizontalPad, borderBottomColor: theme.border },
          ]}
        >
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.back}>← End route</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Navigate</Text>
          <View style={{ width: 72 }} />
        </View>

        <View style={[styles.destStrip, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          <Text style={[styles.eyebrow, { color: gold }]}>HEADING TO</Text>
          <Text style={[styles.destTitle, { color: theme.textPrimary }]} numberOfLines={2}>
            {journey.title}
          </Text>
          {journey.subtitle ? (
            <Text style={[styles.destSub, { color: theme.textSecondary }]} numberOfLines={2}>
              {journey.subtitle}
            </Text>
          ) : null}
        </View>

        <WebView
          source={{ html: guidanceMapHtml }}
          style={styles.map}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          mixedContentMode="always"
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          geolocationEnabled
          overScrollMode="never"
          nestedScrollEnabled={Platform.OS === 'android'}
          androidLayerType="hardware"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { color: '#C9A227', fontWeight: '600', width: 72 },
  title: { fontSize: 16, fontWeight: '700' },
  destStrip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  destTitle: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  destSub: { fontSize: 13, marginTop: 4 },
  map: { flex: 1 },
});
