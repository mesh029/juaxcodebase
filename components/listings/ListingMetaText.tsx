import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import {
  formatListingDistanceLabel,
  type ListingDistanceReference,
} from '../../lib/listings-distance';

type Coordinates = { latitude: number; longitude: number };

type ListingMetaTextProps = {
  coords: Coordinates;
  price: string;
  reference: ListingDistanceReference;
  fallbackCounty?: string;
  distanceColor: string;
  metaColor: string;
  style?: StyleProp<TextStyle>;
};

export function ListingDistanceBadge({
  coords,
  reference,
  fallbackLabel,
  color,
  approxColor,
  style,
}: {
  coords: Coordinates;
  reference: ListingDistanceReference;
  fallbackLabel?: string;
  color: string;
  approxColor?: string;
  style?: StyleProp<TextStyle>;
}) {
  const distLabel = formatListingDistanceLabel(coords, reference);
  if (!distLabel) {
    return fallbackLabel ? (
      <Text style={[styles.badge, { color: approxColor ?? color }, style]}>{fallbackLabel}</Text>
    ) : null;
  }

  return (
    <Text style={[styles.badge, { color }, style]}>
      {distLabel}
      {reference.isApproximate ? (
        <Text style={[styles.badgeApprox, { color: approxColor ?? color }]}> approx</Text>
      ) : null}
    </Text>
  );
}

export function ListingMetaText({
  coords,
  price,
  reference,
  fallbackCounty,
  distanceColor,
  metaColor,
  style,
}: ListingMetaTextProps) {
  const distLabel = formatListingDistanceLabel(coords, reference);
  if (!distLabel) {
    return (
      <Text style={[styles.meta, { color: metaColor }, style]} numberOfLines={2}>
        {fallbackCounty ? `${fallbackCounty} · ${price}` : price}
      </Text>
    );
  }

  return (
    <Text style={[styles.meta, { color: metaColor }, style]} numberOfLines={2}>
      <Text style={[styles.distance, { color: distanceColor }]}>{distLabel}</Text>
      {reference.isApproximate ? (
        <Text style={{ color: metaColor, fontFamily: 'Inter_400Regular' }}> · approx</Text>
      ) : null}
      <Text style={{ color: metaColor }}>{' · '}{price}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  meta: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  distance: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  badge: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  badgeApprox: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
});
