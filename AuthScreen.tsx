import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from './theme/colors';
import { JuaSunIcon } from './components/onboarding/JuaSunIcon';

type Stage = 'phone' | 'otp' | 'name';

const KEYBOARD_DONE_ID = 'auth-keyboard-done';
const AUTH = Colors.auth;
const PRIMARY = Colors.light.primary;

type Props = {
  mode: 'signin' | 'signup';
  onBack: () => void;
  onComplete: () => void;
};

function inputBorder(hasError: boolean, hasValue: boolean): string {
  if (hasError) return Colors.light.error;
  if (hasValue) return PRIMARY;
  return AUTH.inputBorder;
}

export function AuthScreen({ mode, onBack, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(), []);
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(30);
  const [resendReady, setResendReady] = useState(false);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const phoneRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => phoneRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (stage !== 'otp') return;
    setResendCountdown(30);
    setResendReady(false);
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setResendReady(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const sendCode = () => {
    Keyboard.dismiss();
    if (phone.replace(/\s/g, '').length < 9) {
      setError('Enter a valid 9-digit number');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStage('otp');
    }, 1400);
  };

  const completeAuth = useCallback(() => {
    phoneRef.current?.blur();
    nameRef.current?.blur();
    otpRefs.current.forEach((ref) => ref?.blur());
    Keyboard.dismiss();

    let settled = false;
    const run = () => {
      if (settled) return;
      settled = true;
      hideSub?.remove();
      onComplete();
    };

    let hideSub: { remove: () => void } | undefined;
    if (Platform.OS === 'ios') {
      hideSub = Keyboard.addListener('keyboardDidHide', run);
      setTimeout(run, 350);
    } else {
      InteractionManager.runAfterInteractions(run);
    }
  }, [onComplete]);

  const onOtpChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.filter(Boolean).length === 6) {
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        if (mode === 'signup') setStage('name');
        else completeAuth();
      }, 1200);
    }
  };

  const onOtpKey = (i: number, key: string) => {
    if (key === 'Backspace' && !otp[i] && i > 0) {
      const next = [...otp];
      next[i - 1] = '';
      setOtp(next);
      otpRefs.current[i - 1]?.focus();
    }
  };

  const finish = () => {
    if (completing) return;
    if (!name.trim()) {
      setError('Enter your name');
      return;
    }
    setError('');
    setCompleting(true);
    completeAuth();
  };

  const verifyOtp = () => {
    if (otp.filter(Boolean).length < 6) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (mode === 'signup') setStage('name');
      else completeAuth();
    }, 1000);
  };

  const maskedPhone = `+254 ${phone.slice(0, 3)}*** ${phone.slice(-3)}`;
  const ctaDisabled =
    completing ||
    loading ||
    (stage === 'phone'
      ? phone.replace(/\s/g, '').length < 9
      : stage === 'name'
        ? !name.trim()
        : otp.filter(Boolean).length < 6);

  const renderCta = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={ctaDisabled}
      style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
    >
      {loading || completing ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={AUTH.muted} size="small" />
          <Text style={styles.loadingText}>Please wait…</Text>
        </View>
      ) : (
        <Text style={[styles.ctaLabel, ctaDisabled && styles.ctaLabelDisabled]}>{label}</Text>
      )}
    </Pressable>
  );

  const numericInputProps = Platform.OS === 'ios' ? { inputAccessoryViewID: KEYBOARD_DONE_ID } : {};

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusRow}>
          <Text style={styles.statusTime}>9:41</Text>
        </View>

        <Pressable onPress={onBack} style={styles.backRow} hitSlop={8}>
          <View style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </View>
          <JuaSunIcon size={24} />
        </Pressable>

        <View style={styles.body}>
          {stage === 'phone' && (
            <>
              <Text style={styles.title}>
                {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text style={styles.sub}>We&apos;ll send a 6-digit code to verify</Text>
              <View style={[styles.phoneRow, { borderColor: inputBorder(!!error, phone.length > 0) }]}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.flag}>🇰🇪</Text>
                  <Text style={styles.prefixText}>+254</Text>
                </View>
                <TextInput
                  ref={phoneRef}
                  value={phone}
                  onChangeText={(v) => {
                    setError('');
                    const digits = v.replace(/\D/g, '').slice(0, 9);
                    const fmt = digits.replace(/(\d{3})(\d{3})(\d{0,3})/, (_, a, b, c) =>
                      c ? `${a} ${b} ${c}` : b ? `${a} ${b}` : a,
                    );
                    setPhone(fmt);
                  }}
                  placeholder="712 345 678"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={styles.phoneInput}
                  {...numericInputProps}
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          )}

          {stage === 'otp' && (
            <>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.sub}>
                Sent to <Text style={styles.subStrong}>{maskedPhone}</Text>
              </Text>
              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    value={digit}
                    onChangeText={(v) => onOtpChange(i, v)}
                    onKeyPress={({ nativeEvent }) => onOtpKey(i, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={1}
                    style={[
                      styles.otpCell,
                      digit ? styles.otpCellFilled : null,
                      { borderColor: digit ? PRIMARY : AUTH.inputBorder },
                    ]}
                    {...numericInputProps}
                  />
                ))}
              </View>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={AUTH.muted} size="small" />
                  <Text style={styles.loadingText}>Verifying…</Text>
                </View>
              ) : null}
            </>
          )}

          {stage === 'name' && (
            <>
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.title}>What&apos;s your name?</Text>
              <Text style={styles.sub}>How you&apos;ll appear in bookings</Text>
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={(v) => {
                  setError('');
                  setName(v);
                }}
                placeholder="Full name"
                placeholderTextColor="rgba(255,255,255,0.2)"
                style={[styles.nameInput, { borderColor: inputBorder(!!error, name.length > 0) }]}
                autoFocus
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={finish}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          )}
        </View>

        <View style={styles.footer}>
          {stage === 'phone' && (
            <>
              {renderCta('Send code', sendCode)}
              <Text style={styles.legal}>
                By continuing you agree to our Terms & Privacy Policy
              </Text>
            </>
          )}
          {stage === 'otp' && (
            <>
              {renderCta('Verify', verifyOtp)}
              <View style={styles.resendRow}>
                <Text style={styles.resendMuted}>Didn&apos;t receive it?</Text>
                {resendReady ? (
                  <Pressable
                    onPress={() => {
                      setOtp(['', '', '', '', '', '']);
                      setResendCountdown(30);
                      setResendReady(false);
                    }}
                  >
                    <Text style={styles.resendLink}>Resend</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.resendMuted}>Resend in {resendCountdown}s</Text>
                )}
              </View>
            </>
          )}
          {stage === 'name' && renderCta('Complete setup', finish)}
        </View>
      </ScrollView>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
          <View style={styles.keyboardAccessory}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8} style={styles.keyboardDoneBtn}>
              <Text style={styles.keyboardDoneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: AUTH.background,
    },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
    },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 8,
    },
    statusTime: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: 12,
      fontFamily: 'Inter_500Medium',
    },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 24,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: AUTH.inputBg,
      borderWidth: 1,
      borderColor: AUTH.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backBtnText: {
      color: '#FFFFFF',
      fontSize: 18,
    },
    body: {
      flex: 1,
      paddingTop: 8,
    },
    title: {
      color: '#FFFFFF',
      fontSize: 28,
      fontFamily: 'Inter_700Bold',
      marginBottom: 8,
      lineHeight: 34,
    },
    sub: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      marginBottom: 28,
      lineHeight: 20,
    },
    subStrong: {
      color: 'rgba(255,255,255,0.8)',
      fontFamily: 'Inter_600SemiBold',
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: AUTH.inputBg,
      borderWidth: 1.5,
      overflow: 'hidden',
    },
    phonePrefix: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderRightWidth: 1,
      borderRightColor: AUTH.inputBorder,
    },
    flag: { fontSize: 18 },
    prefixText: {
      color: '#FFFFFF',
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
    },
    phoneInput: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 16,
      color: '#FFFFFF',
      fontSize: 18,
      fontFamily: 'Inter_500Medium',
    },
    error: {
      color: Colors.light.error,
      fontSize: 12,
      marginTop: 8,
      fontFamily: 'Inter_400Regular',
    },
    otpRow: {
      flexDirection: 'row',
      gap: 10,
    },
    otpCell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 16,
      backgroundColor: AUTH.inputBg,
      borderWidth: 1.5,
      textAlign: 'center',
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: '#FFFFFF',
    },
    otpCellFilled: {
      backgroundColor: '#1A1000',
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    loadingText: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    checkCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#0D2E1A',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    checkMark: {
      color: Colors.light.success,
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
    },
    nameInput: {
      borderRadius: 16,
      borderWidth: 1.5,
      backgroundColor: AUTH.inputBg,
      paddingHorizontal: 20,
      paddingVertical: 16,
      color: '#FFFFFF',
      fontSize: 18,
      fontFamily: 'Inter_500Medium',
    },
    footer: {
      paddingTop: 16,
      marginTop: 'auto',
    },
    cta: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: PRIMARY,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: PRIMARY,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 4,
    },
    ctaDisabled: {
      backgroundColor: '#1A1000',
      shadowOpacity: 0,
      elevation: 0,
    },
    ctaLabel: {
      color: AUTH.ctaText,
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
    },
    ctaLabelDisabled: {
      color: AUTH.muted,
    },
    legal: {
      color: 'rgba(255,255,255,0.3)',
      fontSize: 11,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 16,
      fontFamily: 'Inter_400Regular',
    },
    resendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      marginTop: 16,
    },
    resendMuted: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    resendLink: {
      color: PRIMARY,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    keyboardAccessory: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: AUTH.inputBg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: AUTH.inputBorder,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    keyboardDoneBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    keyboardDoneText: {
      color: PRIMARY,
      fontSize: 17,
      fontFamily: 'Inter_600SemiBold',
    },
  });
