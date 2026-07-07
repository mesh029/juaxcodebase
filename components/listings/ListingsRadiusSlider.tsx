import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

const THUMB_SIZE = 22;

type ListingsRadiusSliderProps = {
  value: number;
  min: number;
  max: number;
  onChange: (km: number) => void;
  theme: {
    border: string;
    mutedSurface: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    primary: string;
    canvas: string;
  };
};

export function ListingsRadiusSlider({ value, min, max, onChange, theme }: ListingsRadiusSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  const clamp = useCallback(
    (next: number) => Math.max(min, Math.min(max, Math.round(next))),
    [min, max],
  );

  const setFromX = useCallback(
    (x: number) => {
      const width = trackWidthRef.current;
      if (width <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / width));
      onChange(clamp(min + ratio * (max - min)));
    },
    [clamp, min, max, onChange],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => setFromX(evt.nativeEvent.locationX),
        onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
      }),
    [setFromX],
  );

  const pct = (value - min) / (max - min);
  const thumbLeft = Math.max(0, pct * Math.max(0, trackWidth - THUMB_SIZE));

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Search radius</Text>
        <Text style={[styles.value, { color: theme.textPrimary }]}>{value} km</Text>
      </View>
      <View
        style={[styles.trackOuter, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          trackWidthRef.current = width;
          setTrackWidth(width);
        }}
        {...pan.panHandlers}
      >
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: theme.primary }]} />
        <View
          style={[
            styles.thumb,
            {
              left: thumbLeft,
              backgroundColor: theme.canvas,
              borderColor: theme.primary,
            },
          ]}
        />
      </View>
      <View style={styles.rangeRow}>
        <Text style={[styles.rangeLabel, { color: theme.textMuted }]}>{min} km</Text>
        <Text style={[styles.rangeLabel, { color: theme.textMuted }]}>{max} km</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  value: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  trackOuter: {
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 18,
    opacity: 0.22,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    top: (36 - THUMB_SIZE) / 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
