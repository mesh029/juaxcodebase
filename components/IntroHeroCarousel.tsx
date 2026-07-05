import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ImageBackground,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { BRAND } from '../theme/brand';
import { CarouselZone } from './chrome/CarouselZone';

export type IntroHeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
  workAreas: string[];
  comingSoon?: boolean;
};

type Props = {
  slides: IntroHeroSlide[];
  cardWidth: number;
  cardHeight?: number;
  darkMode?: boolean;
  hint?: string;
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Milliseconds between auto-advances; 0 disables autoplay. */
  autoAdvanceMs?: number;
};

const DEFAULT_AUTO_MS = 5500;
const USER_PAUSE_MS = 12000;

export function IntroHeroCarousel({
  slides,
  cardWidth,
  cardHeight = 200,
  darkMode = false,
  hint = 'Swipe for more',
  activeIndex: controlledIndex,
  onIndexChange: onControlledIndexChange,
  autoAdvanceMs = DEFAULT_AUTO_MS,
}: Props) {
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = controlledIndex ?? internalIndex;
  const onIndexChange = onControlledIndexChange ?? setInternalIndex;
  const listRef = useRef<FlatList<IntroHeroSlide>>(null);
  const pauseUntilRef = useRef(0);
  const gap = 12;
  const snap = cardWidth + gap;

  const pauseAutoplay = useCallback((ms = USER_PAUSE_MS) => {
    pauseUntilRef.current = Date.now() + ms;
  }, []);

  useEffect(() => {
    if (slides.length === 0) return;
    const safe = Math.max(0, Math.min(activeIndex, slides.length - 1));
    listRef.current?.scrollToOffset({ offset: safe * snap, animated: true });
  }, [activeIndex, slides.length, snap]);

  useEffect(() => {
    if (slides.length <= 1 || autoAdvanceMs <= 0) return;
    const id = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      const next = (activeIndex + 1) % slides.length;
      onIndexChange(next);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [activeIndex, autoAdvanceMs, onIndexChange, slides.length]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / snap);
      const clamped = Math.max(0, Math.min(idx, slides.length - 1));
      if (clamped !== activeIndex) {
        pauseAutoplay();
        onIndexChange(clamped);
      }
    },
    [activeIndex, onIndexChange, pauseAutoplay, slides.length, snap],
  );

  const renderItem: ListRenderItem<IntroHeroSlide> = useCallback(
    ({ item }) => (
      <ImageBackground
        source={item.image}
        style={[
          styles.card,
          { width: cardWidth, height: cardHeight, borderColor: darkMode ? BRAND.dark.border : BRAND.light.border },
        ]}
        imageStyle={styles.cardImage}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        <View style={styles.goldWash} />
        <View style={styles.cardBody}>
          {item.comingSoon ? (
            <View style={styles.soonPill}>
              <Text style={styles.soonPillText}>Coming soon</Text>
            </View>
          ) : null}
          <Text style={styles.eyebrow}>{item.eyebrow}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.desc} numberOfLines={3}>
            {item.description}
          </Text>
          <View style={styles.workRow}>
            {item.workAreas.slice(0, 3).map((area) => (
              <View key={area} style={styles.workChip}>
                <Text style={styles.workChipText} numberOfLines={1}>
                  {area}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ImageBackground>
    ),
    [cardWidth, cardHeight, darkMode],
  );

  if (slides.length === 0) return null;

  return (
    <CarouselZone style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.hint, { color: darkMode ? BRAND.dark.muted : BRAND.light.textMuted }]}>{hint}</Text>
        <Text style={[styles.counter, { color: darkMode ? BRAND.dark.muted : BRAND.light.textMuted }]}>
          {activeIndex + 1}/{slides.length}
        </Text>
      </View>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled={false}
        snapToInterval={snap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: gap }}
        onScrollBeginDrag={() => pauseAutoplay()}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, index) => ({ length: snap, offset: snap * index, index })}
        renderItem={renderItem}
      />
      <View style={styles.dots}>
        {slides.map((slide, i) => (
          <Pressable
            key={slide.id}
            onPress={() => {
              pauseAutoplay();
              onIndexChange(i);
            }}
            hitSlop={8}
          >
            <View style={[styles.dot, i === activeIndex && styles.dotOn]} />
          </Pressable>
        ))}
      </View>
    </CarouselZone>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  hint: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  counter: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardImage: {
    borderRadius: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 7, 5, 0.55)',
  },
  goldWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(201, 162, 39, 0.12)',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  soonPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(201, 162, 39, 0.28)',
    marginBottom: 6,
  },
  soonPillText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    color: BRAND.goldSoft,
    textTransform: 'uppercase',
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    color: BRAND.gold,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  desc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  workRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  workChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    maxWidth: '100%',
  },
  workChipText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.92)',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(201, 162, 39, 0.28)',
  },
  dotOn: {
    width: 18,
    backgroundColor: BRAND.primary,
  },
});
