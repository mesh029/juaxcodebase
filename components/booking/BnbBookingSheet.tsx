import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Theme = {
  sheet: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  mutedSurface: string;
};

type Props = {
  visible: boolean;
  listingTitle: string;
  priceLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
  theme: Theme;
};

export function BnbBookingSheet({
  visible,
  listingTitle,
  priceLabel,
  onClose,
  onConfirm,
  submitting,
  theme,
}: Props) {
  const [error, setError] = useState('');
  const [payPhase, setPayPhase] = useState<'idle' | 'processing'>('idle');

  useEffect(() => {
    if (!visible) {
      setPayPhase('idle');
      setError('');
    }
  }, [visible]);

  const pay = async () => {
    if (payPhase === 'processing' || submitting) return;
    setError('');
    setPayPhase('processing');
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await onConfirm();
      setPayPhase('idle');
    } catch (err) {
      setPayPhase('idle');
      setError(err instanceof Error ? err.message : 'Could not complete booking');
    }
  };

  const busy = submitting || payPhase === 'processing';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>Reserve this stay</Text>
          <Text style={[styles.lead, { color: theme.textSecondary }]}>
            {listingTitle} · {priceLabel}
          </Text>
          <Text style={[styles.lead, { color: theme.textSecondary }]}>
            Unlocks exact address, host contact, coordinates, and in-app navigation.
          </Text>

          {payPhase === 'processing' ? (
            <View style={[styles.payBox, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.payText, { color: theme.textPrimary }]}>Processing M-Pesa payment…</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary, opacity: busy ? 0.7 : 1 }]}
            disabled={busy}
            onPress={() => void pay()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Pay with M-Pesa (pilot)</Text>
            )}
          </Pressable>

          <Text style={[styles.todoNote, { color: theme.textSecondary }]}>
            M-Pesa STK via secure server when configured.
          </Text>

          <Pressable onPress={onClose} style={styles.cancelBtn} disabled={busy}>
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
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800' },
  lead: { fontSize: 14, lineHeight: 20 },
  payBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  payText: { fontSize: 15, fontWeight: '600' },
  cta: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  todoNote: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 15 },
  error: { color: '#c0392b', fontSize: 13 },
});
