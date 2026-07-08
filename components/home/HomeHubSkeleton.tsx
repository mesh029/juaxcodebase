import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../theme';
import { SkeletonBlock } from '../ui/SkeletonBlock';

type Props = {
  cardWidth: number;
  darkMode?: boolean;
};

/** Home hub loading placeholders — hero, quick row, stay cards. */
export function HomeHubSkeleton({ cardWidth, darkMode = false }: Props) {
  const stayCardW = Math.min(228, Math.max(176, Math.round(cardWidth * 0.62)));
  const quickGap = Spacing[1.5];
  const quickTileW = Math.max(64, Math.floor((cardWidth - quickGap * 4) / 5));
  const bone = darkMode ? styles.boneDark : styles.boneLight;

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading home content">
      <SkeletonBlock height={196} width={cardWidth} radius={Radius.lg} style={bone} />
      <View style={styles.quickRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.quickBone, styles.quickBoneStack, { width: quickTileW }, bone]}>
            <SkeletonBlock height={44} width={44} radius={Radius.md} style={bone} />
            <SkeletonBlock height={10} width="56%" radius={Radius.xs} style={bone} />
          </View>
        ))}
      </View>
      <SkeletonBlock height={12} width={160} radius={Radius.xs} style={[styles.labelBone, bone]} />
      <View style={styles.stayRow}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: stayCardW }}>
            <SkeletonBlock height={108} radius={Radius.md} style={bone} />
            <SkeletonBlock height={14} width="88%" style={[styles.lineBone, bone]} />
            <SkeletonBlock height={12} width="62%" style={[styles.lineBone, bone]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing[1.5],
  },
  boneLight: {
    backgroundColor: 'rgba(127, 127, 142, 0.16)',
  },
  boneDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickRow: {
    flexDirection: 'row',
    gap: Spacing[1.5],
    marginTop: Spacing[0.5],
  },
  quickBone: {
    borderRadius: Radius.lg,
  },
  quickBoneStack: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[1.5],
  },
  labelBone: {
    marginTop: Spacing[2],
  },
  stayRow: {
    flexDirection: 'row',
    gap: Spacing[1.5],
  },
  lineBone: {
    marginTop: Spacing[1],
  },
});
