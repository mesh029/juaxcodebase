import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ListingRequest } from '../../lib/api-types';
import {
  LISTING_REQUEST_STEPS,
  LISTING_REQUEST_STATUS_LABELS,
  listingRequestStepIndex,
} from '../../lib/listing-requests';

type ThemeSlice = {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  border: string;
  sheet: string;
  mutedSurface: string;
  canvas: string;
};

type Props = {
  visible: boolean;
  request: ListingRequest | null;
  loading?: boolean;
  submitting?: boolean;
  onClose: () => void;
  onReply: (body: string) => Promise<void>;
  theme: ThemeSlice;
};

export function ListingRequestSheet({
  visible,
  request,
  loading,
  submitting,
  onClose,
  onReply,
  theme,
}: Props) {
  const [reply, setReply] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const stepIndex = useMemo(
    () => (request ? (request.stepIndex ?? listingRequestStepIndex(request.status)) : 0),
    [request],
  );

  const statusLabel =
    request?.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[request?.status ?? ''] ?? request?.status;

  const closed = request?.status === 'viewing_completed' || request?.status === 'cancelled';
  const messageCount = request?.messages?.length ?? 0;

  // When the sheet opens (or a new message lands), drop the user at the bottom of
  // the thread with the reply box in view so they can respond immediately.
  useEffect(() => {
    if (!visible || loading || !request) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      if (!closed) inputRef.current?.focus();
    }, 350);
    return () => clearTimeout(t);
  }, [visible, loading, request, closed, messageCount]);

  async function handleSend() {
    const text = reply.trim();
    if (!text) return;
    await onReply(text);
    setReply('');
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.canvas }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={[styles.close, { color: theme.primary }]}>Close</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {request?.kind === 'viewing'
              ? 'House viewing'
              : request?.kind === 'tour'
                ? 'BnB tour'
                : 'Stay request'}
          </Text>
          <View style={{ width: 48 }} />
        </View>

        {loading || !request ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.title, { color: theme.textPrimary }]}>{request.listingTitle}</Text>
            <Text style={[styles.status, { color: theme.primary }]}>{statusLabel}</Text>
            {request.riderName ? (
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {request.pickupMode === 'taxi' ? 'Driver' : 'Rider'}: {request.riderName}
                {request.riderPhone ? ` · ${request.riderPhone}` : ''}
              </Text>
            ) : request.pickupModeLabel ? (
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                Pickup: {request.pickupModeLabel}
              </Text>
            ) : null}

            <View style={styles.stepper}>
              {LISTING_REQUEST_STEPS.map((step, i) => {
                const done = stepIndex >= i;
                const active = stepIndex === i;
                return (
                  <View key={step} style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepDot,
                        {
                          backgroundColor: done ? theme.primary : theme.mutedSurface,
                          borderColor: active ? theme.primary : theme.border,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: done ? theme.textPrimary : theme.textMuted },
                      ]}
                    >
                      {LISTING_REQUEST_STATUS_LABELS[step]}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Messages</Text>
            <View style={[styles.thread, { borderColor: theme.border, backgroundColor: theme.sheet }]}>
              {(request.messages ?? []).length === 0 ? (
                <Text style={[styles.emptyThread, { color: theme.textMuted }]}>
                  No messages yet — our team will reach out here.
                </Text>
              ) : (
                (request.messages ?? []).map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.bubble,
                      m.senderRole === 'admin'
                        ? [styles.bubbleAdmin, { backgroundColor: theme.mutedSurface }]
                        : m.senderRole === 'user'
                          ? [styles.bubbleUser, { backgroundColor: theme.sheet, borderColor: theme.border }]
                          : [styles.bubbleSystem, { backgroundColor: theme.canvas }],
                    ]}
                  >
                    <Text style={[styles.bubbleRole, { color: theme.textMuted }]}>{m.senderRole}</Text>
                    <Text style={[styles.bubbleBody, { color: theme.textPrimary }]}>{m.body}</Text>
                  </View>
                ))
              )}
            </View>

            {!closed ? (
              <View style={styles.replyRow}>
                <TextInput
                  ref={inputRef}
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Reply to ops…"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[
                    styles.replyInput,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.sheet },
                  ]}
                />
                <Pressable
                  style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}
                  onPress={() => void handleSend()}
                  disabled={submitting || !reply.trim()}
                >
                  <Text style={styles.sendLabel}>Send</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.closedNote, { color: theme.textMuted }]}>
                This request is closed. Start a new viewing from the listing if needed.
              </Text>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  status: { marginTop: 6, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  meta: { marginTop: 4, fontSize: 13, fontFamily: 'Inter_400Regular' },
  stepper: { marginTop: 20, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  stepLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  thread: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    minHeight: 120,
  },
  emptyThread: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 24 },
  bubble: { borderRadius: 10, padding: 10 },
  bubbleAdmin: { marginLeft: 24 },
  bubbleUser: { marginRight: 24, borderWidth: StyleSheet.hairlineWidth },
  bubbleSystem: { alignSelf: 'center', maxWidth: '92%' },
  bubbleRole: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', marginBottom: 4 },
  bubbleBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  replyRow: { marginTop: 16, gap: 10 },
  replyInput: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  sendBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendLabel: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  closedNote: { marginTop: 16, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
});
