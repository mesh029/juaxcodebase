import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ImageBackground,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import { BRAND } from '../theme/brand';
import { ComponentSize, FontFamily, Radius, Spacing, TextRole, Type, HeroOverlay, pagerDotLabel } from '../theme';
import { CarouselZone } from './chrome/CarouselZone';
import { HeroImageScrim } from './chrome/HeroImageScrim';
import { AnimatedPagerDot } from './ui/AnimatedPagerDot';
import { AccessibleText } from './ui/AccessibleText';

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
  const hasComingSoon = slides.some((s) => s.comingSoon);
  // Coming-soon slides carry more chrome (pill + chips) — give them room so text
  // doesn't climb into the map / top chrome.
  const resolvedHeight = hasComingSoon ? Math.max(cardHeight, 236) : cardHeight;

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
          {
            width: cardWidth,
            height: resolvedHeight,
            borderColor: darkMode ? BRAND.dark.border : BRAND.light.border,
          },
        ]}
        imageStyle={styles.cardImage}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <HeroImageScrim />
        <View style={styles.cardBody}>
          <View
            style={styles.cardFooter}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${item.eyebrow}. ${item.title}. ${item.description}`}
          >
            {item.comingSoon ? (
              <View style={styles.soonPill}>
                <AccessibleText style={styles.soonPillText}>Coming soon</AccessibleText>
              </View>
            ) : null}
            <AccessibleText style={styles.eyebrow} numberOfLines={1}>
              {item.eyebrow}
            </AccessibleText>
            <AccessibleText style={styles.title} numberOfLines={item.comingSoon ? 1 : 2}>
              {item.title}
            </AccessibleText>
            <AccessibleText style={styles.desc} numberOfLines={item.comingSoon ? 2 : 2}>
              {item.description}
            </AccessibleText>
            {item.workAreas.length > 0 ? (
              <View style={styles.workRow}>
                {item.workAreas.slice(0, item.comingSoon ? 2 : 3).map((area) => (
                  <View key={area} style={styles.workChip} accessibilityElementsHidden>
                    <AccessibleText style={styles.workChipText} numberOfLines={1}>
                      {area}
                    </AccessibleText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </ImageBackground>
    ),
    [cardWidth, resolvedHeight, darkMode],
  );

  if (slides.length === 0) return null;

  return (
    <CarouselZone style={styles.wrap}>
      <View style={styles.headerRow}>
        <AccessibleText style={[styles.hint, { color: darkMode ? BRAND.dark.muted : BRAND.light.textMuted }]}>
          {hint}
        </AccessibleText>
        <AccessibleText style={[styles.counter, { color: darkMode ? BRAND.dark.muted : BRAND.light.textMuted }]}>
          {activeIndex + 1}/{slides.length}
        </AccessibleText>
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
        accessibilityRole="list"
        accessibilityLabel="Feature highlights"
        accessibilityHint={hint}
        contentContainerStyle={{ paddingRight: gap }}
        onScrollBeginDrag={() => pauseAutoplay()}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, index) => ({ length: snap, offset: snap * index, index })}
        renderItem={renderItem}
      />
      <View style={styles.dots}>
        {slides.map((slide, i) => (
          <AnimatedPagerDot
            key={slide.id}
            active={i === activeIndex}
            activeColor={BRAND.primary}
            idleColor="rgba(232, 149, 26, 0.28)"
            onPress={() => {
              pauseAutoplay();
              onIndexChange(i);
            }}
            accessibilityLabel={pagerDotLabel(i, slides.length, i === activeIndex)}
          />
        ))}
      </View>
    </CarouselZone>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[1],
    paddingHorizontal: Spacing[0.5],
  },
  hint: {
    fontSize: TextRole.overline.fontSize,
    lineHeight: TextRole.overline.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.2,
  },
  counter: {
    fontSize: TextRole.overline.fontSize,
    lineHeight: TextRole.overline.lineHeight,
    fontFamily: FontFamily.medium,
  },
  card: {
    borderRadius: ComponentSize.card.radius,
    overflow: 'hidden',
    marginRight: Spacing[1.5],
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardImage: {
    borderRadius: ComponentSize.card.radius,
  },
  cardBody: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing[1.5],
  },
  cardFooter: {
    maxHeight: '100%',
    paddingHorizontal: Spacing[1.5],
    paddingTop: Spacing[1],
    paddingBottom: Spacing[1.5],
    borderRadius: Radius.md,
    backgroundColor: HeroOverlay.panelBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HeroOverlay.panelBorder,
    overflow: 'hidden',
  },
  soonPill: {
    alignSelf: 'flex-start',
    minHeight: 22,
    paddingHorizontal: Spacing[1],
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(201, 162, 39, 0.28)',
    marginBottom: 6,
  },
  soonPillText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.8,
    color: BRAND.goldSoft,
    textTransform: 'uppercase',
  },
  eyebrow: {
    fontSize: TextRole.overline.fontSize,
    lineHeight: TextRole.overline.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.8,
    color: BRAND.gold,
    marginBottom: 2,
  },
  title: {
    fontSize: Type.title3.fontSize,
    lineHeight: Type.title3.lineHeight,
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  desc: {
    fontSize: TextRole.label.fontSize,
    fontFamily: FontFamily.regular,
    lineHeight: TextRole.label.lineHeight,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: Spacing[1],
  },
  workRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: Spacing[0.5],
  },
  workChip: {
    minHeight: 26,
    paddingHorizontal: Spacing[1],
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    maxWidth: '48%',
  },
  workChipText: {
    fontSize: TextRole.overline.fontSize,
    lineHeight: TextRole.overline.lineHeight,
    fontFamily: FontFamily.semibold,
    color: 'rgba(255,255,255,0.92)',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1],
    marginTop: Spacing[1.5],
  },
});
