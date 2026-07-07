import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ViewingPickupMode } from '../../lib/api-types';
import { VIEWING_PICKUP_MODE_LABELS } from '../../lib/listing-requests';

type Theme = {
  sheet: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  mutedSurface: string;
  canvas: string;
};

type Props = {
  visible: boolean;
  listingTitle: string;
  priceLabel?: string;
  onClose: () => void;
  onConfirm: (opts: { pickupMode: ViewingPickupMode; userNote?: string }) => Promise<void>;
  submitting: boolean;
  theme: Theme;
};

const OPTIONS: ViewingPickupMode[] = ['taxi', 'rider'];

export function ViewingRequestSheet({
  visible,
  listingTitle,
  priceLabel,
  onClose,
  onConfirm,
  submitting,
  theme,
}: Props) {
  const [pickupMode, setPickupMode] = useState<ViewingPickupMode>('taxi');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setPickupMode('taxi');
      setNote('');
      setError('');
    }
  }, [visible]);

  const confirm = async () => {
    if (submitting) return;
    setError('');
    try {
      await onConfirm({
        pickupMode,
        userNote: note.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit viewing request');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>Request a viewing</Text>
          <Text style={[styles.lead, { color: theme.textSecondary }]}>
            {listingTitle}
            {priceLabel ? ` · ${priceLabel}` : ''}
          </Text>
          <Text style={[styles.lead, { color: theme.textSecondary }]}>
            Choose how you want to get to the property — our team will arrange pickup and follow up in Activity.
          </Text>

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Pickup preference</Text>
          <View style={styles.optionRow}>
            {OPTIONS.map((mode) => {
              const selected = pickupMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[
                    styles.option,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected ? theme.mutedSurface : theme.canvas,
                    },
                  ]}
                  onPress={() => setPickupMode(mode)}
                >
                  <Text style={styles.optionEmoji}>{mode === 'taxi' ? '🚗' : '🏍️'}</Text>
                  <Text style={[styles.optionLabel, { color: theme.textPrimary }]}>
                    {VIEWING_PICKUP_MODE_LABELS[mode]}
                  </Text>
                  <Text style={[styles.optionHint, { color: theme.textSecondary }]}>
                    {mode === 'taxi' ? 'Comfortable car or taxi' : 'Quick boda / rider'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Preferred time, meeting point, etc."
            placeholderTextColor={theme.textMuted}
            multiline
            style={[
              styles.noteInput,
              { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.canvas },
            ]}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary, opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
            onPress={() => void confirm()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Submit viewing request</Text>
            )}
          </Pressable>

          <Pressable onPress={onClose} style={styles.cancelBtn} disabled={submitting}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    paddingBottom: 32,
    gap: 10,
  },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  lead: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  sectionLabel: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  optionRow: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  optionHint: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  noteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  cta: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  error: { color: '#c0392b', fontSize: 13, fontFamily: 'Inter_400Regular' },
});
