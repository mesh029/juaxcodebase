import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { MAKE } from '../../theme/make';

type DarkProps = { darkMode?: boolean };

function fg(dark: boolean) {
  return dark ? '#F9FAFB' : MAKE.text;
}
function muted(dark: boolean) {
  return dark ? MAKE.dark.muted : MAKE.textMuted;
}

export function MakeLabel({ children, darkMode = false }: { children: string } & DarkProps) {
  return (
    <Text style={[styles.label, { color: darkMode ? '#A1A1AA' : MAKE.textMuted }]}>{children}</Text>
  );
}

export function MakeDivider({ darkMode = false }: DarkProps) {
  return <View style={[styles.divider, { backgroundColor: darkMode ? '#2A1810' : MAKE.divider }]} />;
}

export function MakePillToggle<T extends string>({
  options,
  value,
  onChange,
  darkMode = false,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
} & DarkProps) {
  return (
    <View style={[styles.pillTrack, { backgroundColor: darkMode ? MAKE.dark.surface : MAKE.surface }]}>
      {options.map(({ key, label }) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[
              styles.pillBtn,
              active && {
                backgroundColor: darkMode ? MAKE.primary : '#FFFFFF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 1,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: active ? (darkMode ? '#FFFFFF' : MAKE.text) : muted(darkMode) },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MakeSelectRow({
  selected,
  label,
  sublabel,
  onPress,
  icon,
  darkMode = false,
}: {
  selected: boolean;
  label: string;
  sublabel?: string;
  onPress: () => void;
  icon?: ReactNode;
} & DarkProps) {
  const selBg = darkMode ? '#3D1808' : MAKE.primaryLight;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.selectRow,
        {
          borderColor: selected ? MAKE.primary : darkMode ? MAKE.dark.border : MAKE.border,
          backgroundColor: selected ? selBg : 'transparent',
        },
      ]}
    >
      {icon}
      <View style={styles.selectRowText}>
        <Text style={[styles.selectRowLabel, { color: fg(darkMode) }]}>{label}</Text>
        {sublabel ? <Text style={[styles.selectRowSub, { color: muted(darkMode) }]}>{sublabel}</Text> : null}
      </View>
      <View
        style={[
          styles.selectRadio,
          {
            borderColor: selected ? MAKE.primary : darkMode ? '#4B5563' : '#D1D5DB',
            backgroundColor: selected ? MAKE.primary : 'transparent',
          },
        ]}
      >
        {selected ? <Text style={styles.selectCheck}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

export function MakeMpesaChip({ phone = '0712 *** 456', darkMode = false }: { phone?: string } & DarkProps) {
  return (
    <View style={[styles.mpesaChip, { backgroundColor: darkMode ? MAKE.dark.surface : MAKE.surface }]}>
      <View style={styles.mpesaIcon}>
        <Text style={styles.mpesaIconText}>M</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.mpesaTitle, { color: fg(darkMode) }]}>M-Pesa</Text>
        <Text style={[styles.mpesaSub, { color: muted(darkMode) }]}>{phone}</Text>
      </View>
      <Text style={styles.mpesaChange}>Change</Text>
    </View>
  );
}

export function MakeCTA({
  label,
  onPress,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.cta, disabled && styles.ctaDisabled, style]}
    >
      {loading ? (
        <View style={styles.ctaLoading}>
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={styles.ctaText}>Processing…</Text>
        </View>
      ) : (
        <Text style={[styles.ctaText, disabled && styles.ctaTextDisabled]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function MakeSummaryRow({
  label,
  value,
  bold,
  darkMode = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
} & DarkProps) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: muted(darkMode) }]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: fg(darkMode), fontFamily: bold ? 'Inter_700Bold' : 'Inter_500Medium' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function MakeStatusStepper({
  steps,
  current,
  darkMode = false,
}: {
  steps: string[];
  current: number;
} & DarkProps) {
  return (
    <View style={styles.statusWrap}>
      <View style={styles.statusRow}>
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const last = i === steps.length - 1;
          return (
            <View key={`${i}-${step}`} style={styles.statusStep}>
              <View style={styles.statusDotRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: done
                        ? MAKE.primary
                        : active
                          ? MAKE.primaryLight
                          : darkMode
                            ? '#3D2418'
                            : MAKE.surface,
                      borderWidth: active ? 2 : 0,
                      borderColor: MAKE.primary,
                    },
                  ]}
                >
                  {done ? (
                    <Text style={styles.statusDotCheck}>✓</Text>
                  ) : active ? (
                    <View style={[styles.statusDotInner, { backgroundColor: MAKE.primary }]} />
                  ) : (
                    <View style={[styles.statusDotIdle, { backgroundColor: darkMode ? '#5C3D30' : '#C4A99E' }]} />
                  )}
                </View>
                {!last ? (
                  <View
                    style={[
                      styles.statusLine,
                      { backgroundColor: done ? MAKE.primary : darkMode ? '#3D2418' : MAKE.border },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  styles.statusLabel,
                  { color: done || active ? MAKE.primary : darkMode ? '#5C3D30' : '#9CA3AF' },
                ]}
                numberOfLines={2}
              >
                {step}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export const MAKE_TRIPS = {
  active: [
    {
      type: 'laundry' as const,
      id: 'JF-20260626-001',
      title: 'Jua Fua · 4 kg · Westlands Hub',
      sub: 'Collected',
      step: 2,
      steps: ['Requested', 'Pickup scheduled', 'Collected', 'Ready', 'Delivered'],
    },
    {
      type: 'stay' as const,
      id: 'SK-20260710-042',
      title: 'Saka Keja · Kilimani Studio',
      sub: 'Check-in Thu 2 PM',
      step: -1,
      steps: [] as string[],
    },
  ],
  history: [
    { id: 'RD-20260624-091', title: 'Jua X Comfort · CBD → Westgate', date: 'Jun 24', amount: 'KES 360' },
    { id: 'JF-20260620-018', title: 'Jua Fua · 6 kg · Parklands Hub', date: 'Jun 20', amount: 'KES 630' },
    { id: 'SK-20260610-031', title: 'Saka Keja · Karen Cottage 3 nights', date: 'Jun 10', amount: 'KES 26,000' },
    { id: 'RD-20260605-044', title: 'Jua X Ride · Kilimani → JKIA', date: 'Jun 5', amount: 'KES 240' },
  ],
};

export const SERVICE_DOT_COLORS = {
  laundry: '#2563EB',
  stay: '#7C3AED',
  ride: '#10B981',
} as const;

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  pillTrack: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  pillBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 8,
  },
  selectRowText: { flex: 1, minWidth: 0 },
  selectRowLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  selectRowSub: { fontSize: 12, marginTop: 2, fontFamily: 'Inter_400Regular' },
  selectRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCheck: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_700Bold' },
  mpesaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  mpesaIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: MAKE.mpesa,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mpesaIconText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  mpesaTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  mpesaSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  mpesaChange: { fontSize: 12, fontFamily: 'Inter_500Medium', color: MAKE.primary },
  cta: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: MAKE.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MAKE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  ctaDisabled: {
    backgroundColor: MAKE.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  ctaTextDisabled: { color: MAKE.textMuted },
  ctaLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  summaryLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  summaryValue: { fontSize: 14 },
  statusWrap: { paddingHorizontal: 16, paddingVertical: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start' },
  statusStep: { flex: 1, alignItems: 'center' },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  statusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    zIndex: 1,
  },
  statusDotCheck: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Inter_700Bold' },
  statusDotInner: { width: 8, height: 8, borderRadius: 4 },
  statusDotIdle: { width: 6, height: 6, borderRadius: 3 },
  statusLine: { flex: 1, height: 2, marginHorizontal: -2 },
  statusLabel: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 52,
  },
});
