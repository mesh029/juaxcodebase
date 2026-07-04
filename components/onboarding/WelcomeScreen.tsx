import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { JuaSunIcon } from './JuaSunIcon';

const AUTH = Colors.auth;

type Props = {
  onSignUp: () => void;
  onSignIn: () => void;
};

export function WelcomeScreen({ onSignUp, onSignIn }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.brandZone}>
        <JuaSunIcon size={72} />
        <Text style={styles.title}>Jua X</Text>
        <Text style={styles.tag}>Kenya&apos;s super-app</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.actions}>
        <Pressable onPress={onSignUp} style={styles.primaryBtn}>
          <Text style={styles.primaryLabel}>Create account</Text>
        </Pressable>
        <Pressable onPress={onSignIn} style={styles.secondaryBtn}>
          <Text style={styles.secondaryLabel}>Sign in</Text>
        </Pressable>
        <Text style={styles.legal}>
          By continuing you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AUTH.background,
  },
  brandZone: {
    flex: 0.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.light.primary,
    letterSpacing: -0.3,
  },
  tag: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.4)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 24,
  },
  actions: {
    flex: 0.6,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryBtn: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 6,
  },
  primaryLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: AUTH.ctaText,
  },
  secondaryBtn: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.8)',
  },
  legal: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
});
