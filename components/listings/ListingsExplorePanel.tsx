import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type ListingCatalogArea = string;

type ListingsExplorePanelTheme = {
  border: string;
  mutedSurface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  canvas: string;
};

type ListingsExplorePanelProps = {
  theme: ListingsExplorePanelTheme;
  listingsViewMode: 'list' | 'map';
  onViewModeChange: (mode: 'list' | 'map') => void;
  listingCounty: ListingCatalogArea;
  onListingCountyChange: (county: ListingCatalogArea) => void;
  listingAreaChips: ListingCatalogArea[];
  listingRadiusKm: number;
  onListingRadiusChange: (km: number) => void;
  radiusOptions: readonly number[];
  showRadiusChips: boolean;
  locationReady: boolean;
  onRequestLocation?: () => void;
};

function ViewModeButton({
  active,
  icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  theme: ListingsExplorePanelTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.viewModeBtn,
        { backgroundColor: active ? theme.primaryLight : 'transparent' },
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? theme.primary : theme.textSecondary}
      />
      <Text
        style={[
          styles.viewModeLabel,
          { color: active ? theme.primary : theme.textSecondary },
          active && styles.viewModeLabelOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ListingsExplorePanel({
  theme,
  listingsViewMode,
  onViewModeChange,
  listingCounty,
  onListingCountyChange,
  listingAreaChips,
  listingRadiusKm,
  onListingRadiusChange,
  radiusOptions,
  showRadiusChips,
  locationReady,
  onRequestLocation,
}: ListingsExplorePanelProps) {
  return (
    <View style={[styles.panel, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
      <View style={styles.topRow}>
        <Text style={[styles.panelTitle, { color: theme.textSecondary }]}>Explore</Text>
        <View style={[styles.viewToggle, { backgroundColor: theme.canvas, borderColor: theme.border }]}>
          <ViewModeButton
            active={listingsViewMode === 'list'}
            icon="list-outline"
            label="List"
            theme={theme}
            onPress={() => onViewModeChange('list')}
          />
          <ViewModeButton
            active={listingsViewMode === 'map'}
            icon="map-outline"
            label="Map"
            theme={theme}
            onPress={() => {
              onViewModeChange('map');
              if (!locationReady) onRequestLocation?.();
            }}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {listingAreaChips.map((key) => {
          const on = listingCounty === key;
          const label =
            key === 'near_me'
              ? 'Near me'
              : key === 'any'
                ? 'All areas'
                : key.charAt(0).toUpperCase() + key.slice(1);
          return (
            <Pressable
              key={key}
              style={[
                styles.chip,
                { borderColor: theme.border, backgroundColor: theme.canvas },
                on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
              ]}
              onPress={() => onListingCountyChange(key)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: theme.textSecondary },
                  on && { color: theme.primary, fontFamily: 'Inter_600SemiBold' },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {showRadiusChips ? (
        locationReady ? (
          <View style={styles.radiusRow}>
            <Text style={[styles.radiusLabel, { color: theme.textSecondary }]}>Within</Text>
            {radiusOptions.map((km) => {
              const on = listingRadiusKm === km;
              return (
                <Pressable
                  key={km}
                  style={[
                    styles.radiusChip,
                    { borderColor: theme.border, backgroundColor: theme.canvas },
                    on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                  ]}
                  onPress={() => onListingRadiusChange(km)}
                >
                  <Text
                    style={[
                      styles.radiusChipText,
                      { color: theme.textSecondary },
                      on && { color: theme.primary, fontFamily: 'Inter_600SemiBold' },
                    ]}
                  >
                    {km} km
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Pressable
            style={[styles.locationPrompt, { borderColor: theme.border, backgroundColor: theme.canvas }]}
            onPress={() => onRequestLocation?.()}
          >
            <Ionicons name="location-outline" size={16} color={theme.primary} />
            <Text style={[styles.locationPromptText, { color: theme.textSecondary }]}>
              Turn on location to search nearby
            </Text>
            <Text style={[styles.locationPromptAction, { color: theme.primary }]}>Enable</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 10,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
  },
  viewModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
  },
  viewModeLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  viewModeLabelOn: {
    fontFamily: 'Inter_600SemiBold',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  radiusLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginRight: 2,
  },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  radiusChipText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  locationPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  locationPromptText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  locationPromptAction: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
