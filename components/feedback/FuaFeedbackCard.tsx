import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LaundryOrder } from '../../lib/api-types';
import { confirmLaundryDelivery, submitFeedback } from '../../lib/api';

type Theme = {
  sheet: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  mutedSurface: string;
};

type Props = {
  order: LaundryOrder;
  theme: Theme;
  onSubmitted?: () => void;
  onConfirmed?: (order: LaundryOrder) => void;
};

export function FuaFeedbackCard({ order, theme, onSubmitted, onConfirmed }: Props) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const needsConfirm = order.status === 'delivered' && !order.customerConfirmedAt;

  const confirmDelivery = async () => {
    setConfirming(true);
    setError('');
    try {
      const { order: updated } = await confirmLaundryDelivery(order.id);
      onConfirmed?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm delivery');
    } finally {
      setConfirming(false);
    }
  };

  const submit = async () => {
    if (body.trim().length < 10) {
      setError('Please write at least 10 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback({
        service: order.serviceType === 'mamafua' ? 'mamafua' : 'fua',
        category: 'rating',
        rating,
        title: `FUA order ${order.id.slice(0, 8)}`,
        body: body.trim(),
        orderId: order.id,
      });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.card, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
        <Text style={[styles.thanks, { color: theme.textPrimary }]}>Thanks for your feedback!</Text>
      </View>
    );
  }

  if (needsConfirm) {
    return (
      <View style={[styles.card, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Confirm delivery</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          {order.pickupLabel} · {order.loadLabel}
        </Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          Your order was dropped off. Confirm you received everything before leaving a review.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={() => void confirmDelivery()}
          disabled={confirming}
          style={[styles.submit, { backgroundColor: theme.primary }]}
        >
          {confirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Yes, I received my laundry</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Rate your FUA order</Text>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>
        {order.pickupLabel} · {order.loadLabel}
      </Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} style={styles.starBtn}>
            <Text style={[styles.star, { color: n <= rating ? theme.primary : theme.textSecondary }]}>
              {n <= rating ? '★' : '☆'}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
        value={body}
        onChangeText={setBody}
        multiline
        placeholder="How was pickup, wash quality, and delivery?"
        placeholderTextColor={theme.textSecondary}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={submitting}
        style={[styles.submit, { backgroundColor: theme.primary }]}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit feedback</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13 },
  stars: { flexDirection: 'row', gap: 4 },
  starBtn: { padding: 4 },
  star: { fontSize: 28 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  error: { color: '#c0392b', fontSize: 13 },
  submit: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  submitText: { color: '#fff', fontWeight: '700' },
  thanks: { fontSize: 15, fontWeight: '600', textAlign: 'center', paddingVertical: 8 },
});
