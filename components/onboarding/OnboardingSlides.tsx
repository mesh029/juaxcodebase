import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { JuaSunIcon } from './JuaSunIcon';

const { width: SCREEN_W } = Dimensions.get('window');
const AUTH = Colors.auth;

type Slide = {
  id: string;
  label?: string;
  headline?: string;
  sub?: string;
  emoji?: string;
  brand?: boolean;
};

const SLIDES: Slide[] = [
  { id: 'brand', brand: true },
  {
    id: 'valet',
    label: 'VALET',
    headline: 'Fresh laundry, delivered',
    sub: 'Door pickup or station drop-off. We handle the rest.',
    emoji: '🧺',
  },
  {
    id: 'stays',
    label: 'SAKA KEJA',
    headline: 'Find your stay in seconds',
    sub: 'BnBs and rentals across Kenya, with exact location after booking.',
    emoji: '🏠',
  },
  {
    id: 'rides',
    label: 'RIDES',
    headline: 'Get there, your way',
    sub: 'Transparent KES fares. No surge surprises.',
    emoji: '🚗',
  },
];

type Props = {
  onDone: () => void;
  onSkip: () => void;
};

export function OnboardingSlides({ onDone, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const isLast = index === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) setIndex(i);
  };

  const goNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const renderSlide = ({ item }: { item: Slide }) => {
    if (item.brand) {
      return (
        <View style={[styles.slide, { width: SCREEN_W }]}>
          <View style={styles.glowWrap}>
            <View style={styles.glowOuter} />
            <JuaSunIcon size={100} />
          </View>
          <Text style={styles.brandTitle}>Jua X</Text>
          <Text style={styles.brandTag}>Kenya&apos;s super-app</Text>
          <Text style={styles.brandMotto}>Hustle bright. Live bright.</Text>
        </View>
      );
    }
    return (
      <View style={[styles.slide, { width: SCREEN_W }]}>
        <View style={styles.emojiCircle}>
          <Text style={styles.emoji}>{item.emoji}</Text>
        </View>
        <Text style={styles.slideLabel}>{item.label}</Text>
        <Text style={styles.slideHeadline}>{item.headline}</Text>
        <Text style={styles.slideSub}>{item.sub}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.skipRow}>
        <Pressable onPress={onSkip} hitSlop={12} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        bounces
        style={styles.list}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => listRef.current?.scrollToIndex({ index: i, animated: true })}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
        <Pressable onPress={goNext} style={styles.cta}>
          <Text style={styles.ctaLabel}>{isLast ? 'Get started →' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AUTH.background,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  skipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  glowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  glowOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${Colors.light.primary}18`,
    borderWidth: 2,
    borderColor: `${Colors.light.primary}40`,
  },
  brandTitle: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    color: Colors.light.primary,
    letterSpacing: -0.4,
  },
  brandTag: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: `${Colors.light.primary}B3`,
  },
  brandMotto: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.6,
    marginTop: 8,
  },
  emojiCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emoji: {
    fontSize: 56,
  },
  slideLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.6,
    color: Colors.light.primary,
    textTransform: 'uppercase',
  },
  slideHeadline: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 32,
  },
  slideSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  footer: {
    paddingHorizontal: 24,
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.light.primary,
  },
  cta: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.auth.ctaText,
  },
});
