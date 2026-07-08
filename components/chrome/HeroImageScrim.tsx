import { StyleSheet, View } from 'react-native';
import { HeroOverlay } from '../../theme/overlays';

/**
 * Consistent bottom-weighted scrim for hero photos.
 * Use once per ImageBackground — do not stack extra dark overlays on top.
 */
export function HeroImageScrim() {
  return (
    <>
      <View style={styles.wash} />
      <View style={styles.gold} />
      <View style={styles.scrimLight} />
      <View style={styles.scrimMid} />
      <View style={styles.scrimDeep} />
    </>
  );
}

const styles = StyleSheet.create({
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HeroOverlay.wash,
  },
  gold: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HeroOverlay.gold,
  },
  scrimLight: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '58%',
    height: '16%',
    backgroundColor: HeroOverlay.scrimLight,
  },
  scrimMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '38%',
    height: '20%',
    backgroundColor: HeroOverlay.scrimMid,
  },
  scrimDeep: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '38%',
    backgroundColor: HeroOverlay.scrimDeep,
  },
});
