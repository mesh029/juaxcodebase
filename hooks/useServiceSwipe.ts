import { useCallback, useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useServiceSwipeBlockRef } from '../context/ServiceSwipeContext';

export const SWIPEABLE_SEGMENTS = ['home', 'laundry', 'bnbs', 'rides'] as const;
export type SwipeableSegment = (typeof SWIPEABLE_SEGMENTS)[number];

/** @deprecated use SwipeableSegment */
export type SwipeableService = Exclude<SwipeableSegment, 'home'>;

const SWIPE_START_DISTANCE = 40;
const SWIPE_DISTANCE = 88;
const HORIZONTAL_RATIO = 2;
const MIN_HORIZONTAL_VELOCITY = 0.18;

type Options = {
  enabled: boolean;
  active: SwipeableSegment;
  onChange: (segment: SwipeableSegment) => void;
};

export function useServiceSwipePan({ enabled, active, onChange }: Options) {
  const blockRef = useServiceSwipeBlockRef();
  const enabledRef = useRef(enabled);
  const activeRef = useRef(active);
  enabledRef.current = enabled;
  activeRef.current = active;

  const goAdjacent = useCallback(
    (direction: 'prev' | 'next') => {
      const idx = SWIPEABLE_SEGMENTS.indexOf(activeRef.current);
      if (idx < 0) return;
      const nextIdx = direction === 'next' ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= SWIPEABLE_SEGMENTS.length) return;
      void Haptics.selectionAsync();
      onChange(SWIPEABLE_SEGMENTS[nextIdx]);
    },
    [onChange],
  );

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (!enabledRef.current) return false;
          if (blockRef?.current) return false;
          const { dx, dy } = gesture;
          return (
            Math.abs(dx) > SWIPE_START_DISTANCE &&
            Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO
          );
        },
        onPanResponderRelease: (_, gesture) => {
          if (!enabledRef.current || blockRef?.current) return;
          const { dx, dy, vx } = gesture;
          if (
            Math.abs(dx) < SWIPE_DISTANCE ||
            Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO ||
            Math.abs(vx) < MIN_HORIZONTAL_VELOCITY
          ) {
            return;
          }
          if (dx < 0) goAdjacent('next');
          else goAdjacent('prev');
        },
      }),
    [blockRef, goAdjacent],
  );
}

export function toSwipeableSegment(segment: string): SwipeableSegment {
  if (
    segment === 'home' ||
    segment === 'laundry' ||
    segment === 'bnbs' ||
    segment === 'rides'
  ) {
    return segment;
  }
  return 'home';
}

/** @deprecated use toSwipeableSegment */
export function toSwipeableService(service: string): SwipeableService {
  const seg = toSwipeableSegment(service);
  return seg === 'home' ? 'laundry' : seg;
}
