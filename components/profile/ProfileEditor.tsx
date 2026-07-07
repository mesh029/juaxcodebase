import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { UserProfile } from '../../lib/api-types';
import { updateProfile } from '../../lib/api';

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
  profile: UserProfile;
  onClose: () => void;
  onSaved: (user: UserProfile) => void;
  theme: Theme;
};

const COUNTIES = ['kisumu', 'nairobi', 'mombasa', 'nyamira'] as const;

export function ProfileEditor({ visible, profile, onClose, onSaved, theme }: Props) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [county, setCounty] = useState(profile.county ?? 'kisumu');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { user } = await updateProfile({
        displayName: displayName.trim() || undefined,
        email: email.trim() || null,
        county: county || null,
        bio: bio.trim() || null,
      });
      onSaved(user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Edit profile</Text>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Display name</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={theme.textSecondary}
          />
          <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={theme.textSecondary}
          />
          <Text style={[styles.label, { color: theme.textSecondary }]}>County</Text>
          <View style={styles.chipRow}>
            {COUNTIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCounty(c)}
                style={[
                  styles.chip,
                  { borderColor: theme.border, backgroundColor: theme.mutedSurface },
                  county === c && { borderColor: theme.primary },
                ]}
              >
                <Text style={{ color: county === c ? theme.primary : theme.textSecondary, textTransform: 'capitalize' }}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bio, { borderColor: theme.border, color: theme.textPrimary }]}
            value={bio}
            onChangeText={setBio}
            multiline
            placeholder="A short intro (optional)"
            placeholderTextColor={theme.textSecondary}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.primary }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
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
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  bio: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  error: { color: '#c0392b', fontSize: 13, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnPrimary: { borderWidth: 0 },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
