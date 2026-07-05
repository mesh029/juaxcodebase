import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from './context/AuthContext';
import { ApiError, emailSignIn, emailSignUp } from './lib/api';
import { Colors } from './theme/colors';
import { JuaSunIcon } from './components/onboarding/JuaSunIcon';

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

function mapAuthError(err: unknown, mode: 'signin' | 'signup'): string {
  if (err instanceof ApiError) {
    if (err.code === 'email_exists') return 'Email already registered — try Sign in';
    if (err.code === 'invalid_credentials') return 'Invalid email or password';
    if (err.code === 'weak_password') return 'Password must be at least 8 characters';
    if (err.code === 'name_required') return 'Enter your name';
    return err.message;
  }
  if (err instanceof Error && err.message.includes('EXPO_PUBLIC_API_BASE_URL')) {
    return 'API not configured — set EXPO_PUBLIC_API_BASE_URL';
  }
  return mode === 'signup' ? 'Sign up failed — try again' : 'Sign in failed — try again';
}

export function AuthScreen({ mode, onBack, onComplete }: Props) {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const submit = useCallback(async () => {
    Keyboard.dismiss();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Enter your name');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result =
        mode === 'signup'
          ? await emailSignUp(trimmedEmail, password, name.trim(), 'kisumu')
          : await emailSignIn(trimmedEmail, password);
      await signIn(result.token, result.user);
      onComplete();
    } catch (err) {
      setError(mapAuthError(err, mode));
    } finally {
      setLoading(false);
    }
  }, [email, password, name, mode, signIn, onComplete]);

  const canSubmit =
    !loading &&
    email.trim().includes('@') &&
    password.length >= 8 &&
    (mode === 'signin' || name.trim().length > 0);

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
        <Pressable onPress={onBack} style={styles.backRow} hitSlop={8}>
          <View style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </View>
          <JuaSunIcon size={24} />
        </Pressable>

        <View style={styles.body}>
          <Text style={styles.title}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.sub}>
            {mode === 'signup'
              ? 'Email and password — OTP coming later'
              : 'Sign in with your email and password'}
          </Text>

          {mode === 'signup' ? (
            <TextInput
              value={name}
              onChangeText={(v) => {
                setError('');
                setName(v);
              }}
              placeholder="Full name"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="words"
              style={[styles.field, { borderColor: inputBorder(!!error, name.length > 0) }]}
            />
          ) : null}

          <TextInput
            ref={emailRef}
            value={email}
            onChangeText={(v) => {
              setError('');
              setEmail(v);
            }}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.2)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.field, { borderColor: inputBorder(!!error, email.length > 0) }]}
          />

          <View style={[styles.passwordRow, { borderColor: inputBorder(!!error, password.length > 0) }]}>
            <TextInput
              value={password}
              onChangeText={(v) => {
                setError('');
                setPassword(v);
              }}
              placeholder="Password (min 8 characters)"
              placeholderTextColor="rgba(255,255,255,0.2)"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={styles.passwordInput}
              onSubmitEditing={() => void submit()}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={styles.showBtn}>
              <Text style={styles.showBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => void submit()}
            disabled={!canSubmit}
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={AUTH.muted} size="small" />
                <Text style={styles.loadingText}>Please wait…</Text>
              </View>
            ) : (
              <Text style={[styles.ctaLabel, !canSubmit && styles.ctaLabelDisabled]}>
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </Pressable>
          <Text style={styles.legal}>By continuing you agree to our Terms & Privacy Policy</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: AUTH.background },
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
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
    backBtnText: { color: '#FFFFFF', fontSize: 18 },
    body: { flex: 1, paddingTop: 8 },
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
    field: {
      borderRadius: 16,
      borderWidth: 1.5,
      backgroundColor: AUTH.inputBg,
      paddingHorizontal: 20,
      paddingVertical: 16,
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
      marginBottom: 12,
    },
    passwordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1.5,
      backgroundColor: AUTH.inputBg,
      overflow: 'hidden',
    },
    passwordInput: {
      flex: 1,
      paddingHorizontal: 20,
      paddingVertical: 16,
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter_500Medium',
    },
    showBtn: { paddingHorizontal: 16, paddingVertical: 16 },
    showBtnText: { color: PRIMARY, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
    error: { color: Colors.light.error, fontSize: 12, marginTop: 8, fontFamily: 'Inter_400Regular' },
    footer: { paddingTop: 16, marginTop: 'auto' },
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
    ctaDisabled: { backgroundColor: '#1A1000', shadowOpacity: 0, elevation: 0 },
    ctaLabel: { color: AUTH.ctaText, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    ctaLabelDisabled: { color: AUTH.muted },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'Inter_400Regular' },
    legal: {
      color: 'rgba(255,255,255,0.3)',
      fontSize: 11,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 16,
      fontFamily: 'Inter_400Regular',
    },
  });
