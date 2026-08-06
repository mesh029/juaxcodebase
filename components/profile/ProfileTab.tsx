import { memo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon } from '../ui/AppIcon';
import { AccessibleText } from '../ui/AccessibleText';
import { PressableScale } from '../ui/PressableScale';
import { ProfileEditor } from '../profile/ProfileEditor';
import { HapticMap, nestedChrome, chipLabel } from '../../theme';
import { Colors } from '../../theme/colors';
import { SERVICE_DOT_COLORS } from '../make/shared';
import type { LaundryOrder, SubscriptionPlan, UserProfile } from '../../lib/api-types';
import type { ApiUser } from '../../lib/api-types';

type ThemeLite = {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  mutedSurface: string;
  border: string;
  sheet: string;
};

export type ProfileTabProps = {
  theme: ThemeLite;
  themeMode: 'light' | 'dark';
  styles: Record<string, any>;
  profile: UserProfile | null;
  user: ApiUser | null;
  profileEditOpen: boolean;
  setProfileEditOpen: (open: boolean) => void;
  refreshProfile: () => void | Promise<void>;
  signOut: () => void | Promise<void>;
  laundryOrders: LaundryOrder[];
  rentalSubscriptionActive: boolean;
  activeSubscriptionPlan: string | null;
  activeSubscriptionExpiresAt: string | null;
  subscriptionPlans: SubscriptionPlan[];
  themePreference: 'system' | 'light' | 'dark';
  setThemePreference: (p: 'system' | 'light' | 'dark') => void;
  setSubscriptionSheetOpen: (open: boolean) => void;
  goToKejaRentals: () => void;
  goToActivity: () => void;
};

function ProfileTabInner(props: ProfileTabProps) {
  const {
    theme,
    themeMode,
    styles,
    profile,
    user,
    profileEditOpen,
    setProfileEditOpen,
    refreshProfile,
    signOut,
    laundryOrders,
    rentalSubscriptionActive,
    activeSubscriptionPlan,
    activeSubscriptionExpiresAt,
    subscriptionPlans,
    themePreference,
    setThemePreference,
    setSubscriptionSheetOpen,
    goToKejaRentals,
    goToActivity,
  } = props;
  const nestSurface = nestedChrome(themeMode === 'dark');
        const displayName = profile?.displayName ?? user?.displayName ?? 'Guest';
        const phone = profile?.phone ?? user?.phone ?? '';
        const email = profile?.email ?? user?.email ?? '';
        const initials = displayName
          .split(' ')
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const memberSince = profile?.signedUpAt
          ? new Date(profile.signedUpAt).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
          : '—';
        const laundryCount = profile?.stats?.laundryOrders ?? laundryOrders.length;
                return (
          <>
            <PressableScale
              onPress={() => profile && setProfileEditOpen(true)}
              style={[styles.profileHero, nestSurface]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <View style={[styles.makeProfileAvatar, { backgroundColor: theme.primary }]}>
                <AccessibleText style={styles.makeProfileAvatarText}>{initials || 'JX'}</AccessibleText>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AccessibleText style={[styles.makeProfileName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {displayName}
                </AccessibleText>
                <AccessibleText style={[styles.makeProfilePhone, { color: theme.textSecondary }]} numberOfLines={1}>
                  {email || phone || 'Add contact details'}
                </AccessibleText>
                <AccessibleText style={[styles.makeTripSub, { color: theme.primary, marginTop: 4 }]}>
                  Edit profile
                </AccessibleText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </PressableScale>
            {profile ? (
              <ProfileEditor
                visible={profileEditOpen}
                profile={profile}
                onClose={() => setProfileEditOpen(false)}
                onSaved={() => void refreshProfile()}
                theme={theme}
              />
            ) : null}

            <View style={styles.profileStatsRow}>
              <View style={[styles.profileStatCard, nestSurface]}>
                <AccessibleText style={[styles.profileStatValue, { color: theme.textPrimary }]}>
                  {String(laundryCount)}
                </AccessibleText>
                <AccessibleText style={[styles.profileStatLabel, { color: theme.textMuted }]}>Fua orders</AccessibleText>
              </View>
              <View style={[styles.profileStatCard, nestSurface]}>
                <AccessibleText style={[styles.profileStatValue, { color: theme.textPrimary }]} numberOfLines={1}>
                  {memberSince}
                </AccessibleText>
                <AccessibleText style={[styles.profileStatLabel, { color: theme.textMuted }]}>Member</AccessibleText>
              </View>
              <View style={[styles.profileStatCard, nestSurface]}>
                <AccessibleText
                  style={[
                    styles.profileStatValue,
                    { color: rentalSubscriptionActive ? theme.primary : theme.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {rentalSubscriptionActive ? '1' : '0'}
                </AccessibleText>
                <AccessibleText style={[styles.profileStatLabel, { color: theme.textMuted }]}>
                  Subscribed
                </AccessibleText>
              </View>
            </View>

            <AccessibleText style={[styles.profileSectionLabel, { color: theme.textMuted }]}>
              Subscriptions
            </AccessibleText>
            <View style={[styles.profileGroup, nestSurface, { marginBottom: 12 }]}>
              {(() => {
                const planMeta =
                  subscriptionPlans.find((p) => p.plan === activeSubscriptionPlan) ?? null;
                const planLabel =
                  planMeta?.label ??
                  (activeSubscriptionPlan
                    ? `${activeSubscriptionPlan.charAt(0).toUpperCase()}${activeSubscriptionPlan.slice(1)}`
                    : null);
                const expiresLabel = activeSubscriptionExpiresAt
                  ? new Date(activeSubscriptionExpiresAt).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : null;
                return (
                  <PressableScale
                    style={styles.profileRow}
                    onPress={() => {
                      HapticMap.light();
                      if (rentalSubscriptionActive) {
                        goToKejaRentals();
                      } else {
                        setSubscriptionSheetOpen(true);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      rentalSubscriptionActive
                        ? `Keja rental plan active${planLabel ? `, ${planLabel}` : ''}`
                        : 'Subscribe to Keja rentals'
                    }
                  >
                    <View
                      style={[
                        styles.profileRowIcon,
                        {
                          backgroundColor: rentalSubscriptionActive
                            ? `${SERVICE_DOT_COLORS.stay}22`
                            : theme.mutedSurface,
                        },
                      ]}
                    >
                      <AppIcon
                        name="home"
                        size={18}
                        color={rentalSubscriptionActive ? SERVICE_DOT_COLORS.stay : theme.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>
                        Keja rentals
                      </AccessibleText>
                      <AccessibleText
                        style={[styles.makeTripSub, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {rentalSubscriptionActive
                          ? `${planLabel ?? 'Plan'} · active${expiresLabel ? ` · until ${expiresLabel}` : ''}`
                          : 'Not subscribed · unlock viewing requests'}
                      </AccessibleText>
                    </View>
                    {rentalSubscriptionActive ? (
                      <View style={[styles.profileSubBadge, { backgroundColor: `${theme.primary}18` }]}>
                        <AccessibleText style={[styles.profileSubBadgeText, { color: theme.primary }]}>
                          Active
                        </AccessibleText>
                      </View>
                    ) : (
                      <AccessibleText style={[styles.makeTripSub, { color: theme.primary }]}>
                        Plans
                      </AccessibleText>
                    )}
                  </PressableScale>
                );
              })()}
            </View>

            <View style={[styles.profileGroup, nestSurface]}>
              <PressableScale
                style={styles.profileRow}
                onPress={() => {
                  HapticMap.light();
                  goToActivity();
                }}
              >
                <View style={[styles.profileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                  <AppIcon name="bell" size={18} color={theme.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>
                    Activity
                  </AccessibleText>
                  <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                    Orders & updates
                  </AccessibleText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </PressableScale>
              <View style={[styles.profileRowDivider, { backgroundColor: theme.border }]} />
              <View style={styles.profileRow}>
                <View style={[styles.profileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                  <AppIcon name="card" size={18} color={theme.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary }]}>
                    M-Pesa
                  </AccessibleText>
                  <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                    Default payment
                  </AccessibleText>
                </View>
              </View>
            </View>

            <AccessibleText style={[styles.profileSectionLabel, { color: theme.textMuted }]}>
              Appearance
            </AccessibleText>
            <View style={styles.themePreferenceRow}>
              {(
                [
                  { key: 'system' as const, label: 'System', icon: 'phone-portrait-outline' as const },
                  { key: 'light' as const, label: 'Light', icon: 'sunny-outline' as const },
                  { key: 'dark' as const, label: 'Dark', icon: 'moon-outline' as const },
                ] as const
              ).map((opt) => {
                const on = themePreference === opt.key;
                const tint = on ? theme.primary : theme.textSecondary;
                return (
                  <PressableScale
                    key={opt.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={chipLabel(opt.label, on)}
                    style={[
                      styles.themePreferenceChip,
                      nestSurface,
                      on && { borderColor: theme.primary, backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => {
                      HapticMap.selection();
                      setThemePreference(opt.key);
                    }}
                  >
                    <View
                      style={[
                        styles.themePreferenceIconWell,
                        { backgroundColor: on ? `${theme.primary}22` : theme.mutedSurface },
                      ]}
                    >
                      <Ionicons name={opt.icon} size={18} color={tint} />
                    </View>
                    <AccessibleText
                      style={[styles.themePreferenceChipText, { color: tint }]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </AccessibleText>
                  </PressableScale>
                );
              })}
            </View>

            <View style={[styles.profileGroup, nestSurface, { marginTop: 16 }]}>
              <PressableScale style={styles.profileRow} onPress={() => {}}>
                <View style={[styles.profileRowIcon, { backgroundColor: theme.mutedSurface }]}>
                  <AppIcon name="help" size={18} color={theme.textSecondary} />
                </View>
                <AccessibleText style={[styles.makeProfileRowLabel, { color: theme.textPrimary, flex: 1 }]}>
                  Help & support
                </AccessibleText>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </PressableScale>
              <View style={[styles.profileRowDivider, { backgroundColor: theme.border }]} />
              <PressableScale
                style={styles.profileRow}
                onPress={() => {
                  HapticMap.light();
                  void signOut();
                }}
              >
                <View style={[styles.profileRowIcon, { backgroundColor: `${Colors.light.error}18` }]}>
                  <Ionicons name="log-out-outline" size={18} color={Colors.light.error} />
                </View>
                <AccessibleText style={[styles.makeProfileRowLabel, { color: Colors.light.error, flex: 1 }]}>
                  Sign out
                </AccessibleText>
              </PressableScale>
            </View>

            <AccessibleText style={[styles.makeVersion, { color: theme.textMuted, marginTop: 20 }]}>
              Jua X · v1.0.0
            </AccessibleText>
          </>
        );

}

export const ProfileTab = memo(ProfileTabInner);
