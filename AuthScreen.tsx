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
import { BRAND } from './theme/brand';

type Stage = 'phone' | 'otp' | 'name';

const KEYBOARD_DONE_ID = 'auth-keyboard-done';

type Props = {
  darkMode?: boolean;
  onComplete: () => void;
};

const createAuthStyles = (darkMode: boolean) => {
  const palette = darkMode
    ? {
        bg: BRAND.auth.background,
        inputBg: BRAND.auth.inputBg,
        inputBorder: BRAND.auth.inputBorder,
        text: '#FFFFFF',
        sub: 'rgba(255,255,255,0.5)',
        subStrong: 'rgba(255,255,255,0.85)',
        muted: 'rgba(255,255,255,0.4)',
        placeholder: 'rgba(255,255,255,0.2)',
        legal: 'rgba(255,255,255,0.3)',
        ctaDisabled: '#1F2937',
        backBtn: '#1F2937',
        otpFilled: '#1E0A04',
        accessoryBg: '#1F2937',
        accessoryBorder: 'rgba(255,255,255,0.12)',
        spinner: '#FFFFFF',
      }
    : {
        bg: BRAND.authLight.background,
        inputBg: BRAND.authLight.inputBg,
        inputBorder: BRAND.authLight.inputBorder,
        text: BRAND.authLight.text,
        sub: BRAND.authLight.subtext,
        subStrong: BRAND.authLight.text,
        muted: BRAND.authLight.textMuted,
        placeholder: BRAND.authLight.placeholder,
        legal: BRAND.authLight.legal,
        ctaDisabled: BRAND.authLight.ctaDisabled,
        backBtn: BRAND.authLight.backBtn,
        otpFilled: BRAND.primaryLight,
        accessoryBg: BRAND.authLight.accessoryBg,
        accessoryBorder: BRAND.authLight.inputBorder,
        spinner: BRAND.primaryText,
      };

  return {
    palette,
    styles: StyleSheet.create({
      root: {
        flex: 1,
        backgroundColor: palette.bg,
      },
      scroll: {
        flex: 1,
      },
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
        color: palette.muted,
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
      },
      body: {
        flex: 1,
        paddingTop: 24,
      },
      brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 40,
      },
      brandMark: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: BRAND.primary,
        alignItems: 'center',
        justifyContent: 'center',
      },
      brandMarkText: {
        color: BRAND.primaryText,
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
      },
      brandName: {
        color: palette.text,
        fontSize: 20,
        fontFamily: 'Inter_700Bold',
      },
      title: {
        color: palette.text,
        fontSize: 28,
        fontFamily: 'Inter_700Bold',
        marginBottom: 8,
        lineHeight: 34,
      },
      sub: {
        color: palette.sub,
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        marginBottom: 28,
        lineHeight: 20,
      },
      subStrong: {
        color: palette.subStrong,
        fontFamily: 'Inter_600SemiBold',
      },
      phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: palette.inputBg,
        borderWidth: 1.5,
        borderColor: palette.inputBorder,
        overflow: 'hidden',
      },
      phoneRowFocus: {
        borderColor: BRAND.primary,
      },
      phoneRowError: {
        borderColor: '#EF4444',
      },
      phonePrefix: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRightWidth: 1,
        borderRightColor: palette.inputBorder,
      },
      flag: { fontSize: 18 },
      prefixText: {
        color: palette.text,
        fontFamily: 'Inter_600SemiBold',
        fontSize: 16,
      },
      phoneInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 16,
        color: palette.text,
        fontSize: 18,
        fontFamily: 'Inter_500Medium',
      },
      error: {
        color: '#F87171',
        fontSize: 12,
        marginTop: 8,
        fontFamily: 'Inter_400Regular',
      },
      backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: palette.backBtn,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
      },
      backBtnText: {
        color: palette.text,
        fontSize: 18,
      },
      otpRow: {
        flexDirection: 'row',
        gap: 10,
      },
      otpCell: {
        flex: 1,
        aspectRatio: 1,
        borderRadius: 16,
        backgroundColor: palette.inputBg,
        borderWidth: 1.5,
        borderColor: palette.inputBorder,
        textAlign: 'center',
        fontSize: 22,
        fontFamily: 'Inter_700Bold',
        color: palette.text,
      },
      otpCellFilled: {
        borderColor: BRAND.primary,
        backgroundColor: palette.otpFilled,
      },
      loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
      },
      loadingText: {
        color: palette.muted,
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
      },
      checkCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: BRAND.success,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
      },
      checkMark: {
        color: '#fff',
        fontSize: 22,
        fontFamily: 'Inter_700Bold',
      },
      nameInput: {
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: palette.inputBorder,
        backgroundColor: palette.inputBg,
        paddingHorizontal: 20,
        paddingVertical: 16,
        color: palette.text,
        fontSize: 18,
        fontFamily: 'Inter_500Medium',
      },
      footer: {
        paddingTop: 16,
        marginTop: 'auto',
      },
      keyboardAccessory: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        backgroundColor: palette.accessoryBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: palette.accessoryBorder,
        paddingHorizontal: 12,
        paddingVertical: 8,
      },
      keyboardDoneBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      keyboardDoneText: {
        color: BRAND.primary,
        fontSize: 17,
        fontFamily: 'Inter_600SemiBold',
      },
      cta: {
        minHeight: 56,
        borderRadius: 16,
        backgroundColor: BRAND.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: BRAND.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 4,
      },
      ctaDisabled: {
        backgroundColor: palette.ctaDisabled,
        shadowOpacity: 0,
        elevation: 0,
      },
      ctaLabel: {
        color: BRAND.primaryText,
        fontSize: 16,
        fontFamily: 'Inter_600SemiBold',
      },
      legal: {
        color: palette.legal,
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
        color: palette.muted,
        fontSize: 14,
      },
      resendLink: {
        color: BRAND.primary,
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
      },
    }),
  };
};

export function AuthScreen({ darkMode = false, onComplete }: Props) {
  const { palette, styles } = useMemo(() => createAuthStyles(darkMode), [darkMode]);
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const phoneRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => phoneRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const sendCode = () => {
    Keyboard.dismiss();
    if (phone.replace(/\s/g, '').length < 9) {
      setError('Enter a valid Safaricom number');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStage('otp');
    }, 1400);
  };

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
        setStage('name');
      }, 1200);
    }
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

  const dismissKeyboard = () => Keyboard.dismiss();

  const keyboardDoneAccessory =
    Platform.OS === 'ios' ? (
      <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
        <View style={styles.keyboardAccessory}>
          <Pressable onPress={dismissKeyboard} hitSlop={8} style={styles.keyboardDoneBtn}>
            <Text style={styles.keyboardDoneText}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    ) : null;

  const numericInputProps =
    Platform.OS === 'ios'
      ? { inputAccessoryViewID: KEYBOARD_DONE_ID }
      : {};

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
          <ActivityIndicator color={palette.spinner} size="small" />
          <Text style={styles.loadingText}>Please wait…</Text>
        </View>
      ) : (
        <Text style={styles.ctaLabel}>{label}</Text>
      )}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusRow}>
          <Text style={styles.statusTime}>9:41</Text>
        </View>

        <View style={styles.body}>
          {stage === 'phone' && (
            <>
              <View style={styles.brandRow}>
                <View style={styles.brandMark}>
                  <Text style={styles.brandMarkText}>J</Text>
                </View>
                <Text style={styles.brandName}>Jua X</Text>
              </View>
              <Text style={styles.title}>What&apos;s your phone number?</Text>
              <Text style={styles.sub}>We&apos;ll send a verification code</Text>
              <View style={[styles.phoneRow, error ? styles.phoneRowError : phone ? styles.phoneRowFocus : null]}>
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
                  placeholderTextColor={palette.placeholder}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={dismissKeyboard}
                  style={styles.phoneInput}
                  {...numericInputProps}
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          )}

          {stage === 'otp' && (
            <>
              <Pressable onPress={() => setStage('phone')} style={styles.backBtn}>
                <Text style={styles.backBtnText}>←</Text>
              </Pressable>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.sub}>
                Sent via SMS to <Text style={styles.subStrong}>{maskedPhone}</Text>
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
                    keyboardType="number-pad"
                    maxLength={1}
                    style={[styles.otpCell, digit ? styles.otpCellFilled : null]}
                    {...numericInputProps}
                  />
                ))}
              </View>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={palette.spinner} size="small" />
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
              <Text style={styles.sub}>This is how you&apos;ll appear on bookings</Text>
              <TextInput
                ref={nameRef}
                value={name}
                onChangeText={(v) => {
                  setError('');
                  setName(v);
                }}
                placeholder="Full name"
                placeholderTextColor={palette.placeholder}
                style={[styles.nameInput, error ? styles.phoneRowError : name ? styles.phoneRowFocus : null]}
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
              {renderCta('Continue', sendCode)}
              <Text style={styles.legal}>
                By continuing you agree to our Terms of Service and Privacy Policy
              </Text>
            </>
          )}
          {stage === 'otp' && (
            <>
              {renderCta('Verify', () => {
                if (otp.filter(Boolean).length < 6) return;
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  setStage('name');
                }, 1000);
              })}
              <View style={styles.resendRow}>
                <Text style={styles.resendMuted}>Didn&apos;t receive it?</Text>
                <Text style={styles.resendLink}>Resend</Text>
              </View>
            </>
          )}
          {stage === 'name' && renderCta('Get started', finish)}
        </View>
      </ScrollView>
      {keyboardDoneAccessory}
    </KeyboardAvoidingView>
  );
};
