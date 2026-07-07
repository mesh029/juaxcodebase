import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SubscriptionPlan } from '../../lib/api-types';
import { PRODUCTION_TODO } from '../../lib/production-todos';

type Theme = {
  sheet: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  mutedSurface: string;
  canvas: string;
};

type Props = {
  visible: boolean;
  plans: SubscriptionPlan[];
  selectedPlan: string;
  onSelectPlan: (plan: string) => void;
  onClose: () => void;
  onSubscribe: (plan: string) => Promise<void>;
  submitting: boolean;
  theme: Theme;
};

export function SubscriptionSheet({
  visible,
  plans,
  selectedPlan,
  onSelectPlan,
  onClose,
  onSubscribe,
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

  const selected = plans.find((p) => p.plan === selectedPlan) ?? plans[0];

  const pay = async () => {
    if (payPhase === 'processing' || submitting) return;
    setError('');
    setPayPhase('processing');
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await onSubscribe(selectedPlan);
      setPayPhase('idle');
    } catch (err) {
      setPayPhase('idle');
      setError(err instanceof Error ? err.message : 'Could not subscribe');
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
          <Text style={[styles.title, { color: theme.textPrimary }]}>Unlock rental listings</Text>
          <Text style={[styles.lead, { color: theme.textSecondary }]}>
            See exact addresses, landlord contacts, and request viewings in your area.
          </Text>

          {plans.length === 0 ? (
            <Text style={[styles.lead, { color: theme.textSecondary }]}>Plans unavailable — try again later.</Text>
          ) : (
            plans.map((plan) => {
              const on = selectedPlan === plan.plan;
              return (
                <Pressable
                  key={plan.plan}
                  style={[
                    styles.planCard,
                    {
                      borderColor: on ? theme.primary : theme.border,
                      backgroundColor: on ? theme.mutedSurface : theme.canvas,
                    },
                  ]}
                  onPress={() => !busy && onSelectPlan(plan.plan)}
                  disabled={busy}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planLabel, { color: theme.textPrimary }]}>{plan.label}</Text>
                    <Text style={[styles.planMeta, { color: theme.textSecondary }]}>
                      {plan.durationHours >= 168
                        ? `${Math.round(plan.durationHours / 24)} days`
                        : plan.durationHours >= 24
                          ? `${Math.round(plan.durationHours / 24)} day`
                          : `${plan.durationHours}h`}{' '}
                      access · exact rental pins
                    </Text>
                  </View>
                  <Text style={[styles.planPrice, { color: theme.primary }]}>
                    KES {plan.priceKes.toLocaleString()}
                  </Text>
                </Pressable>
              );
            })
          )}

          {payPhase === 'processing' ? (
            <View style={[styles.payBox, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.payText, { color: theme.textPrimary }]}>Processing M-Pesa payment…</Text>
              <Text style={[styles.paySub, { color: theme.textSecondary }]}>
                Simulated checkout — admin will see your {selected?.label ?? 'plan'} subscription
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.cta, { backgroundColor: theme.primary, opacity: busy || plans.length === 0 ? 0.7 : 1 }]}
            disabled={busy || plans.length === 0}
            onPress={() => void pay()}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                Pay with M-Pesa · KES {selected?.priceKes.toLocaleString() ?? '—'}
              </Text>
            )}
          </Pressable>

          <Text style={[styles.todoNote, { color: theme.textSecondary }]}>
            Pilot: dummy payment. {PRODUCTION_TODO.MPESA_STK.split(': ')[1]}
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
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  planLabel: { fontSize: 16, fontWeight: '700' },
  planMeta: { fontSize: 13, marginTop: 2 },
  planPrice: { fontSize: 16, fontWeight: '800' },
  payBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  payText: { fontSize: 15, fontWeight: '600' },
  paySub: { fontSize: 12, textAlign: 'center' },
  cta: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  todoNote: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 15 },
  error: { color: '#c0392b', fontSize: 13 },
});
