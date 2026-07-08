import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ComponentSize,
  A11y,
  FontFamily,
  HapticMap,
  Radius,
  Spacing,
  TextRole,
  chipLabel,
  configureLayoutAnimation,
  nestedChrome,
} from '../../theme';
import { AccessibleText } from '../ui/AccessibleText';
import { AppIcon } from '../ui/AppIcon';
import { PressableScale } from '../ui/PressableScale';

export type ListingCatalogArea = string;

type ListingsExplorePanelTheme = {
  border: string;
  mutedSurface: string;
  sheet: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  canvas: string;
};

export type ListingCatalogKind = 'bnb' | 'house';

type ListingsExplorePanelProps = {
  theme: ListingsExplorePanelTheme;
  darkMode?: boolean;
  collapsed?: boolean;
  listingsViewMode: 'list' | 'map';
  onViewModeChange: (mode: 'list' | 'map') => void;
  listingCatalog: ListingCatalogKind;
  onListingCatalogChange: (kind: ListingCatalogKind) => void;
  listingCounty: ListingCatalogArea;
  onListingCountyChange: (county: ListingCatalogArea) => void;
  listingAreaChips: ListingCatalogArea[];
  countyLabel?: string;
  listingRadiusKm: number;
  onListingRadiusChange: (km: number) => void;
  radiusOptions: readonly number[];
  showRadiusChips: boolean;
  locationReady: boolean;
  onRequestLocation?: () => void;
  resultCount?: number;
};

function areaChipLabel(key: string, countyLabel?: string): string {
  if (key === 'near_me') return 'Near me';
  if (key === 'any') return 'All';
  // County chip: prefer live GPS place name, else capitalize the county key
  // (e.g. mombasa → Mombasa). Never hardcode a town.
  if (countyLabel) return countyLabel;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function ListingsExplorePanel({
  theme,
  darkMode = false,
  collapsed = false,
  listingsViewMode,
  onViewModeChange,
  listingCatalog,
  onListingCatalogChange,
  listingCounty,
  onListingCountyChange,
  listingAreaChips,
  countyLabel,
  listingRadiusKm,
  onListingRadiusChange,
  radiusOptions,
  showRadiusChips,
  locationReady,
  onRequestLocation,
  resultCount,
}: ListingsExplorePanelProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const nestSurface = nestedChrome(darkMode);
  const isBnb = listingCatalog === 'bnb';
  const watermarkColor = darkMode
    ? 'rgba(255,255,255,0.05)'
    : isBnb
      ? 'rgba(244,114,182,0.10)'
      : 'rgba(47,158,106,0.08)';

  const activeAreaLabel = useMemo(
    () => areaChipLabel(listingCounty, countyLabel),
    [listingCounty, countyLabel],
  );

  const subtitle = useMemo(() => {
    const countBit =
      typeof resultCount === 'number' ? `${resultCount} place${resultCount === 1 ? '' : 's'}` : null;
    if (listingCounty === 'near_me') {
      const area = locationReady ? `${listingRadiusKm} km` : 'turn on GPS';
      return countBit ? `${countBit} · ${area}` : area;
    }
    if (listingCounty === 'any') return countBit ? `${countBit} · everywhere` : 'Everywhere';
    return countBit ? `${countBit} · ${activeAreaLabel}` : activeAreaLabel;
  }, [listingCounty, listingRadiusKm, locationReady, activeAreaLabel, resultCount]);

  return (
    <View style={[styles.root, collapsed ? styles.rootCollapsed : null]}>
      {!collapsed ? (
        <View style={styles.watermark} pointerEvents="none" accessibilityElementsHidden>
          <AppIcon name={isBnb ? 'stays' : 'home'} size={160} color={watermarkColor} />
        </View>
      ) : null}

      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <AccessibleText style={[styles.title, { color: theme.textPrimary }]}>Listings</AccessibleText>
          <AccessibleText style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </AccessibleText>
        </View>
        <View style={[styles.viewToggle, nestSurface]} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={chipLabel('List', listingsViewMode === 'list')}
            accessibilityState={{ selected: listingsViewMode === 'list' }}
            style={[
              styles.viewModeBtn,
              listingsViewMode === 'list' && { backgroundColor: theme.primaryLight },
            ]}
            onPress={() => {
              if (listingsViewMode !== 'list') HapticMap.selection();
              onViewModeChange('list');
            }}
          >
            <Ionicons
              name="list-outline"
              size={ComponentSize.icon.sm}
              color={listingsViewMode === 'list' ? theme.primary : theme.textSecondary}
            />
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={chipLabel('Map', listingsViewMode === 'map')}
            accessibilityState={{ selected: listingsViewMode === 'map' }}
            style={[
              styles.viewModeBtn,
              listingsViewMode === 'map' && { backgroundColor: theme.primaryLight },
            ]}
            onPress={() => {
              if (listingsViewMode !== 'map') HapticMap.selection();
              onViewModeChange('map');
              if (!locationReady) onRequestLocation?.();
            }}
          >
            <Ionicons
              name="map-outline"
              size={ComponentSize.icon.sm}
              color={listingsViewMode === 'map' ? theme.primary : theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      {!collapsed ? (
        <View style={styles.choiceRow}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={chipLabel('BnBs', isBnb)}
            accessibilityState={{ selected: isBnb }}
            style={[
              styles.choiceCard,
              nestSurface,
              isBnb && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
            ]}
            onPress={() => {
              if (!isBnb) {
                HapticMap.selection();
                onListingCatalogChange('bnb');
              }
            }}
          >
            <View style={styles.choiceInner}>
              <View
                style={[
                  styles.choiceIconWell,
                  { backgroundColor: isBnb ? `${theme.primary}22` : theme.mutedSurface },
                ]}
              >
                <AppIcon name="stays" size={20} color={isBnb ? theme.primary : theme.textSecondary} />
              </View>
              <View style={styles.choiceCopy}>
                <AccessibleText
                  style={[styles.choiceTitle, { color: isBnb ? theme.primary : theme.textPrimary }]}
                >
                  BnBs
                </AccessibleText>
                <AccessibleText style={[styles.choiceSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  Short stays
                </AccessibleText>
              </View>
            </View>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={chipLabel('Rentals', !isBnb)}
            accessibilityState={{ selected: !isBnb }}
            style={[
              styles.choiceCard,
              nestSurface,
              !isBnb && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
            ]}
            onPress={() => {
              if (isBnb) {
                HapticMap.selection();
                onListingCatalogChange('house');
              }
            }}
          >
            <View style={styles.choiceInner}>
              <View
                style={[
                  styles.choiceIconWell,
                  { backgroundColor: !isBnb ? `${theme.primary}22` : theme.mutedSurface },
                ]}
              >
                <AppIcon name="home" size={20} color={!isBnb ? theme.primary : theme.textSecondary} />
              </View>
              <View style={styles.choiceCopy}>
                <AccessibleText
                  style={[styles.choiceTitle, { color: !isBnb ? theme.primary : theme.textPrimary }]}
                >
                  Rentals
                </AccessibleText>
                <AccessibleText style={[styles.choiceSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  Longer stay
                </AccessibleText>
              </View>
            </View>
          </PressableScale>
        </View>
      ) : null}

      <View style={styles.areaBlock}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.areaScroll}
        contentContainerStyle={styles.areaRow}
        accessibilityRole="tablist"
        accessibilityLabel="Area filter"
      >
        {listingAreaChips.map((key) => {
          const on = listingCounty === key;
          const label = areaChipLabel(key, countyLabel);
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={chipLabel(label, on)}
              accessibilityState={{ selected: on }}
              hitSlop={A11y.compactHitSlop}
              style={[
                styles.areaChip,
                nestSurface,
                on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
              ]}
              onPress={() => {
                configureLayoutAnimation('filter');
                if (!on) HapticMap.selection();
                onListingCountyChange(key);
              }}
            >
              <AccessibleText
                style={[
                  styles.areaChipText,
                  { color: on ? theme.primary : theme.textSecondary },
                  on && styles.areaChipTextOn,
                ]}
              >
                {label}
              </AccessibleText>
            </Pressable>
          );
        })}
        {showRadiusChips ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Distance, ${listingRadiusKm} kilometers`}
            hitSlop={A11y.compactHitSlop}
            style={[styles.areaChip, styles.distanceChip, nestSurface]}
            onPress={() => setFiltersOpen(true)}
          >
            <Ionicons name="resize-outline" size={14} color={theme.textSecondary} />
            <AccessibleText style={[styles.areaChipText, { color: theme.textSecondary }]}>
              {listingRadiusKm} km
            </AccessibleText>
          </Pressable>
        ) : null}
      </ScrollView>
      </View>

      {showRadiusChips && !locationReady && !collapsed ? (
        <Pressable
          style={[styles.locationPrompt, nestSurface]}
          onPress={() => onRequestLocation?.()}
          accessibilityRole="button"
          accessibilityLabel="Enable location"
        >
          <Ionicons name="location-outline" size={16} color={theme.primary} />
          <AccessibleText style={[styles.locationPromptText, { color: theme.textSecondary }]}>
            Turn on location for nearby
          </AccessibleText>
          <AccessibleText style={[styles.locationPromptAction, { color: theme.primary }]}>Enable</AccessibleText>
        </Pressable>
      ) : null}

      <Modal
        visible={filtersOpen}
        animationType="slide"
        transparent
        accessibilityViewIsModal
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable
            style={[styles.sheetCard, { backgroundColor: theme.canvas, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <AccessibleText style={[styles.sheetTitle, { color: theme.textPrimary }]}>Distance</AccessibleText>
            <AccessibleText style={[styles.sheetHint, { color: theme.textSecondary }]}>
              How far should we search?
            </AccessibleText>
            <View style={styles.radiusRow}>
              {radiusOptions.map((km) => {
                const on = listingRadiusKm === km;
                return (
                  <Pressable
                    key={km}
                    accessibilityRole="button"
                    accessibilityLabel={chipLabel(`${km} kilometers`, on)}
                    accessibilityState={{ selected: on }}
                    hitSlop={A11y.compactHitSlop}
                    style={[
                      styles.radiusChip,
                      nestSurface,
                      on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => {
                      configureLayoutAnimation('filter');
                      if (!on) HapticMap.selection();
                      onListingRadiusChange(km);
                    }}
                  >
                    <AccessibleText
                      style={[
                        styles.radiusChipText,
                        { color: on ? theme.primary : theme.textSecondary },
                        on && styles.areaChipTextOn,
                      ]}
                    >
                      {km} km
                    </AccessibleText>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.sheetDone, { backgroundColor: theme.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => setFiltersOpen(false)}
            >
              <AccessibleText style={styles.sheetDoneText}>Done</AccessibleText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    // Never let the listings list below compress this chrome — that was clipping
    // the BnB/Rental cards so area chips looked stacked on top of them.
    flexShrink: 0,
    marginTop: Spacing[0.5],
    marginBottom: Spacing[1.5],
    gap: Spacing[1.5],
  },
  rootCollapsed: {
    marginBottom: Spacing[1],
    gap: Spacing[1],
  },
  watermark: {
    position: 'absolute',
    right: -24,
    top: -8,
    zIndex: 0,
    transform: [{ rotate: '-12deg' }],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[1],
    paddingRight: 8,
    zIndex: 1,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 48,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: FontFamily.bold,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    gap: 2,
  },
  viewModeBtn: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing[1],
    zIndex: 2,
    marginBottom: 2,
  },
  choiceCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 68,
    overflow: 'hidden',
  },
  choiceInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    minHeight: 68,
  },
  choiceIconWell: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  choiceTitle: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
  },
  choiceSub: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
  },
  areaBlock: {
    zIndex: 1,
    flexShrink: 0,
  },
  areaScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    paddingVertical: 2,
  },
  areaChip: {
    minHeight: 34,
    paddingHorizontal: Spacing[1.5],
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  areaChipText: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.medium,
  },
  areaChipTextOn: {
    fontFamily: FontFamily.semibold,
  },
  locationPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    paddingHorizontal: Spacing[1.5],
    paddingVertical: Spacing[1],
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  locationPromptText: {
    flex: 1,
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight + 2,
    fontFamily: FontFamily.regular,
  },
  locationPromptAction: {
    fontSize: TextRole.label.fontSize,
    fontFamily: FontFamily.semibold,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing[2],
    gap: Spacing[1.5],
  },
  sheetTitle: {
    fontSize: TextRole.sectionTitle.fontSize,
    lineHeight: TextRole.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  sheetHint: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight + 2,
    fontFamily: FontFamily.regular,
    marginTop: -4,
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    flexWrap: 'wrap',
  },
  radiusChip: {
    minHeight: ComponentSize.chip.height,
    paddingHorizontal: ComponentSize.chip.paddingX,
    justifyContent: 'center',
    borderRadius: ComponentSize.chip.radius,
    borderWidth: StyleSheet.hairlineWidth,
  },
  radiusChipText: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.medium,
  },
  sheetDone: {
    minHeight: ComponentSize.button.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing[1],
  },
  sheetDoneText: {
    color: '#fff',
    fontSize: TextRole.bodyStrong.fontSize,
    lineHeight: TextRole.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
});
