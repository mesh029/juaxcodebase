import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useServiceSwipeBlockRef } from '../../context/ServiceSwipeContext';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Marks an area as a horizontal carousel / chip row.
 * While the user is touching here, parent service swipe is suppressed.
 */
export function CarouselZone({ children, style }: Props) {
  const blockRef = useServiceSwipeBlockRef();
  if (!blockRef) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View
      style={style}
      onTouchStart={() => {
        blockRef.current = true;
      }}
      onTouchEnd={() => {
        blockRef.current = false;
      }}
      onTouchCancel={() => {
        blockRef.current = false;
      }}
    >
      {children}
    </View>
  );
}
