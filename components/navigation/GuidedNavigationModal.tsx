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

const ANDROID_MAP_WEBVIEW_PROPS =
  Platform.OS === 'android'
    ? { overScrollMode: 'never' as const, nestedScrollEnabled: true, androidLayerType: 'hardware' as const }
    : {};

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
  const canShow = visible && journey && guidanceMapHtml;
  if (!canShow || !journey) return null;

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
          {...ANDROID_MAP_WEBVIEW_PROPS}
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
  back: { fontSize: 16, fontWeight: '600', color: '#C9A227' },
  title: { fontSize: 16, fontWeight: '700' },
  destStrip: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  destTitle: { fontSize: 16, fontWeight: '700' },
  destSub: { fontSize: 13, lineHeight: 18 },
  map: { flex: 1 },
});
