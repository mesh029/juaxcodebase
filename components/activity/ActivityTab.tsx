import { memo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon, type AppIconName } from '../ui/AppIcon';
import { AccessibleText } from '../ui/AccessibleText';
import { EmptyState } from '../ui/EmptyState';
import { PressableScale } from '../ui/PressableScale';
import { MakeStatusStepper, SERVICE_DOT_COLORS } from '../make/shared';
import { FuaFeedbackCard } from '../feedback/FuaFeedbackCard';
import { HapticMap, nestedChrome } from '../../theme';
import {
  isActiveListingRequest,
  LISTING_REQUEST_STATUS_LABELS,
  LISTING_REQUEST_STEPS,
} from '../../lib/listing-requests';
import type { ActivityFeedItem } from '../../lib/app/activity';
import type { BnbBooking, LaundryOrder, ListingRequest } from '../../lib/api-types';

type ThemeLite = {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  mutedSurface: string;
  border: string;
  sheet: string;
  isDark: boolean;
};

export type ActivityTabProps = {
  theme: ThemeLite;
  themeMode: 'light' | 'dark';
  styles: Record<string, any>;
  isAuthed: boolean;
  laundryOrders: LaundryOrder[];
  setLaundryOrders: React.Dispatch<React.SetStateAction<LaundryOrder[]>>;
  bnbBookings: BnbBooking[];
  listingRequests: ListingRequest[];
  activityFeedItems: ActivityFeedItem[];
  activitySection: 'active' | 'updates' | 'history';
  setActivitySection: (s: 'active' | 'updates' | 'history') => void;
  activitySocketConnected: boolean;
  activityBellCount: number;
  activityChatCount: number;
  openListingRequestDetail: (id: string) => void | Promise<void>;
  openBookedStayDetail: (id: string) => void | Promise<void>;
  markLaundryOrderViewed: (id: string) => void;
  /** Own scroll host — avoids nesting inside Home sheet ScrollView (lag). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  refreshColor?: string;
  refreshBackground?: string;
};

function ActivityTabInner({
  theme,
  themeMode,
  styles,
  isAuthed,
  laundryOrders,
  setLaundryOrders,
  bnbBookings,
  listingRequests,
  activityFeedItems,
  activitySection,
  setActivitySection,
  activitySocketConnected,
  activityBellCount,
  activityChatCount,
  openListingRequestDetail,
  openBookedStayDetail,
  markLaundryOrderViewed,
  contentContainerStyle,
  refreshing,
  onRefresh,
  refreshColor,
  refreshBackground,
}: ActivityTabProps) {
  const activityTabBadgeCount = activityBellCount + activityChatCount;
        const activeOrders = laundryOrders.filter(
          (o) => !['delivered', 'cancelled'].includes(o.status),
        );
        const completedOrders = laundryOrders.filter((o) =>
          ['delivered', 'cancelled'].includes(o.status),
        );
        const pendingPayments = laundryOrders.filter(
          (o) => o.paymentStatus === 'pending' || o.paymentStatus === 'unpaid',
        );
        const openRequests = listingRequests.filter((r) => isActiveListingRequest(r.status));
        const listingRequestStepLabels = LISTING_REQUEST_STEPS.map((s) => LISTING_REQUEST_STATUS_LABELS[s]);

        const handleActivityFeedPress = (item: ActivityFeedItem) => {
          if (item.entity === 'listing_request') {
            void openListingRequestDetail(item.entityId);
            return;
          }
          if (item.entity === 'stay') {
            void openBookedStayDetail(item.entityId);
            return;
          }
          if (item.entity === 'laundry') {
            markLaundryOrderViewed(item.entityId);
          }
        };

        const activeItems = [
          ...activeOrders.map((order) => ({
            type: 'laundry' as const,
            id: order.id,
            title: order.pickupLabel,
            sub: `${order.loadLabel} · ${order.status.replace(/_/g, ' ')}`,
            payment: order.paymentStatus ?? 'pending',
            amount: `KES ${order.totalKes.toLocaleString()}`,
            step: order.currentStep,
            steps: order.steps,
          })),
          ...bnbBookings
            .filter((b) => b.status === 'confirmed' || b.status === 'pending_payment')
            .map((b) => ({
              type: 'stay' as const,
              id: b.id,
              listingId: b.listingId,
              title: b.listing?.title ?? 'BnB stay',
              sub: `${b.checkIn} → ${b.checkOut} · ${String(b.status ?? 'pending').replace(/_/g, ' ')}`,
              payment: b.paymentStatus ?? 'pending',
              amount: `KES ${Number(b.totalKes ?? 0).toLocaleString()}`,
              step: b.confirmed ? 2 : 0,
              steps: ['Booked', 'Paid', 'Check-in', 'Done'],
            })),
        ];

        const historyItems = [
          ...completedOrders.map((order) => ({
            id: order.id,
            title: order.pickupLabel,
            date: new Date(order.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
            amount: `KES ${order.totalKes.toLocaleString()}`,
            payment: order.paymentStatus ?? 'pending',
          })),
          ...bnbBookings
            .filter((b) => b.status === 'completed' || b.status === 'cancelled')
            .map((b) => ({
              kind: 'stay' as const,
              id: b.id,
              listingId: b.listingId,
              status: b.status,
              title: b.listing?.title ?? 'BnB stay',
              date: new Date(b.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
              amount: `KES ${Number(b.totalKes ?? 0).toLocaleString()}`,
              payment: b.paymentStatus ?? '—',
            })),
          ...listingRequests
            .filter((r) => !isActiveListingRequest(r.status))
            .map((r) => ({
              kind: 'listing_request' as const,
              id: r.id,
              title:
                r.kind === 'tour'
                  ? `BnB tour · ${r.listingTitle}`
                  : r.kind === 'viewing'
                    ? `House viewing · ${r.listingTitle}`
                    : `Stay · ${r.listingTitle}`,
              date: new Date(r.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
              amount: '—',
              payment: r.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[r.status] ?? r.status,
            })),
        ];

        const fuaActive = activeItems.filter((t) => t.type === 'laundry');
        const kejaActive = activeItems.filter((t) => t.type === 'stay');
        const fuaUpdates = activityFeedItems.filter((i) => i.entity === 'laundry');
        const kejaUpdates = [
          ...activityFeedItems.filter((i) => i.entity === 'stay' || i.entity === 'listing_request'),
          ...openRequests,
        ];
        const followUpCount =
          fuaActive.length +
          kejaActive.length +
          pendingPayments.length +
          fuaUpdates.length +
          openRequests.length +
          activityFeedItems.filter((i) => i.entity === 'stay' || i.entity === 'listing_request').length;
        const byServiceCount = fuaActive.length + kejaActive.length + openRequests.length;
        const sectionTabs: { key: typeof activitySection; label: string; count: number }[] = [
          { key: 'active', label: 'Follow-up', count: followUpCount },
          { key: 'updates', label: 'By service', count: byServiceCount },
          { key: 'history', label: 'Past', count: historyItems.length },
        ];

        const renderServiceHeader = (label: string, icon: AppIconName, color: string, count: number) => (
          <View style={styles.activityServiceHeader}>
            <View style={[styles.activityIconWell, { backgroundColor: `${color}22` }]}>
              <AppIcon name={icon} size={16} color={color} />
            </View>
            <AccessibleText style={[styles.activityServiceTitle, { color: theme.textPrimary }]}>
              {label}
            </AccessibleText>
            {count > 0 ? (
              <View style={[styles.activityServiceCount, { backgroundColor: theme.mutedSurface }]}>
                <AccessibleText style={[styles.activityServiceCountText, { color: theme.textSecondary }]}>
                  {count}
                </AccessibleText>
              </View>
            ) : null}
          </View>
        );

        return (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={contentContainerStyle}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  tintColor={refreshColor}
                  colors={refreshColor ? [refreshColor] : undefined}
                  progressBackgroundColor={refreshBackground}
                />
              ) : undefined
            }
          >
            <View style={styles.activityHero}>
              <View style={styles.activityHeroText}>
                <AccessibleText style={[styles.activityTitle, { color: theme.textPrimary }]}>Activity</AccessibleText>
                <AccessibleText style={[styles.activitySubtitle, { color: theme.textSecondary }]}>
                  {!isAuthed
                    ? 'Sign in to track orders'
                    : followUpCount > 0
                      ? `${followUpCount} needing attention`
                      : activitySocketConnected
                        ? 'All caught up · live on'
                        : 'Orders, stays & requests'}
                </AccessibleText>
              </View>
              <View style={styles.activityHeroIcons}>
                <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                  <AppIcon name="washer" size={16} color={SERVICE_DOT_COLORS.laundry} />
                </View>
                <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                  <AppIcon name="home" size={16} color={SERVICE_DOT_COLORS.stay} />
                </View>
                {(activityBellCount > 0 || activityChatCount > 0) ? (
                  <View style={[styles.activityBadgePill, { backgroundColor: theme.primaryLight }]}>
                    <Ionicons name="notifications-outline" size={16} color={theme.primary} />
                    <AccessibleText style={[styles.activityBadgeText, { color: theme.primary }]}>
                      {activityTabBadgeCount > 99 ? '99+' : String(activityTabBadgeCount)}
                    </AccessibleText>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[styles.activityTabs, { backgroundColor: theme.mutedSurface }]}>
              {sectionTabs.map((tab) => {
                const on = activitySection === tab.key;
                return (
                  <PressableScale
                    key={tab.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[styles.activityTab, on && { backgroundColor: theme.primaryLight }]}
                    onPress={() => {
                      HapticMap.selection();
                      setActivitySection(tab.key);
                    }}
                  >
                    <AccessibleText
                      style={[
                        styles.activityTabLabel,
                        { color: on ? theme.primary : theme.textSecondary },
                      ]}
                    >
                      {tab.label}
                      {tab.count > 0 ? ` · ${tab.count}` : ''}
                    </AccessibleText>
                  </PressableScale>
                );
              })}
            </View>

            {activitySection === 'active' ? (
              <>
                {followUpCount === 0 ? (
                  <EmptyState
                    icon="✨"
                    title="You're all set"
                    description="Payments, chats, and open requests will show here."
                    darkMode={theme.isDark}
                    mutedSurface={theme.mutedSurface}
                    textPrimary={theme.textPrimary}
                    textSecondary={theme.textSecondary}
                    primary={theme.primary}
                    border={theme.border}
                  />
                ) : (
                  <View style={styles.makeTripsActiveList}>
                    {pendingPayments.length > 0 ? (
                      <>
                        {renderServiceHeader('Payments', 'card', theme.primary, pendingPayments.length)}
                        {pendingPayments.map((order) => (
                          <View
                            key={`pay-${order.id}`}
                            style={[
                              styles.activityCard,
                              nestedChrome(themeMode === 'dark'),
                              { borderColor: theme.primary },
                            ]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${theme.primary}18` }]}>
                              <AppIcon name="card" size={18} color={theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]}>
                                Pay for Fua
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {order.pickupLabel}
                              </AccessibleText>
                            </View>
                            <AccessibleText style={[styles.makeHistoryAmount, { color: theme.primary }]}>
                              KES {order.totalKes.toLocaleString()}
                            </AccessibleText>
                          </View>
                        ))}
                      </>
                    ) : null}

                    {(fuaActive.length > 0 || fuaUpdates.length > 0) ? (
                      <>
                        {renderServiceHeader('Fua', 'washer', SERVICE_DOT_COLORS.laundry, fuaActive.length + fuaUpdates.length)}
                        {fuaUpdates.map((item) => (
                          <PressableScale
                            key={item.id}
                            onPress={() => handleActivityFeedPress(item)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                              <AppIcon name="washer" size={18} color={SERVICE_DOT_COLORS.laundry} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]}>
                                {item.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={2}>
                                {item.body}
                              </AccessibleText>
                            </View>
                          </PressableScale>
                        ))}
                        {fuaActive.map((trip) => (
                          <View
                            key={`fua-${trip.id}`}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                              <AppIcon name="washer" size={18} color={SERVICE_DOT_COLORS.laundry} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={1}>
                                {trip.sub}
                              </AccessibleText>
                              {trip.steps.length > 0 ? (
                                <View style={{ marginTop: 8 }}>
                                  <MakeStatusStepper
                                    steps={trip.steps}
                                    current={trip.step}
                                    darkMode={themeMode === 'dark'}
                                  />
                                </View>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </>
                    ) : null}

                    {(kejaActive.length > 0 || kejaUpdates.length > 0) ? (
                      <>
                        {renderServiceHeader(
                          'Keja',
                          'home',
                          SERVICE_DOT_COLORS.stay,
                          kejaActive.length + openRequests.length + activityFeedItems.filter((i) => i.entity === 'stay' || i.entity === 'listing_request').length,
                        )}
                        {activityFeedItems
                          .filter((i) => i.entity === 'stay' || i.entity === 'listing_request')
                          .map((item) => (
                            <PressableScale
                              key={item.id}
                              onPress={() => handleActivityFeedPress(item)}
                              style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                            >
                              <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                                <AppIcon name="home" size={18} color={SERVICE_DOT_COLORS.stay} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]}>
                                  {item.title}
                                </AccessibleText>
                                <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={2}>
                                  {item.body}
                                </AccessibleText>
                              </View>
                            </PressableScale>
                          ))}
                        {openRequests.map((req) => {
                          const statusLabel =
                            req.statusLabel ?? LISTING_REQUEST_STATUS_LABELS[req.status] ?? req.status;
                          return (
                            <PressableScale
                              key={`req-${req.id}`}
                              onPress={() => void openListingRequestDetail(req.id)}
                              style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                            >
                              <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                                <AppIcon name="home" size={18} color={SERVICE_DOT_COLORS.stay} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                  {req.listingTitle}
                                </AccessibleText>
                                <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                  {req.kind === 'tour' ? 'Tour' : req.kind === 'viewing' ? 'Viewing' : 'Stay'} · {statusLabel}
                                </AccessibleText>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                            </PressableScale>
                          );
                        })}
                        {kejaActive.map((trip) => (
                          <PressableScale
                            key={`keja-${trip.id}`}
                            onPress={() => void openBookedStayDetail(trip.id)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                              <AppIcon name="stays" size={18} color={SERVICE_DOT_COLORS.stay} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]} numberOfLines={1}>
                                {trip.sub}
                              </AccessibleText>
                              {trip.steps.length > 0 ? (
                                <View style={{ marginTop: 8 }}>
                                  <MakeStatusStepper
                                    steps={trip.steps}
                                    current={trip.step}
                                    darkMode={themeMode === 'dark'}
                                  />
                                </View>
                              ) : null}
                            </View>
                          </PressableScale>
                        ))}
                      </>
                    ) : null}
                  </View>
                )}
                {completedOrders.filter((o) => o.status === 'delivered').length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    {completedOrders
                      .filter((o) => o.status === 'delivered')
                      .slice(0, 2)
                      .map((order) => (
                        <FuaFeedbackCard
                          key={`fb-${order.id}`}
                          order={order}
                          theme={theme}
                          onConfirmed={(updated) => {
                            setLaundryOrders((prev) =>
                              prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
                            );
                          }}
                        />
                      ))}
                  </View>
                ) : null}
              </>
            ) : null}

            {activitySection === 'updates' ? (
              <>
                {fuaActive.length === 0 && kejaActive.length === 0 && openRequests.length === 0 ? (
                  <EmptyState
                    icon="🏠"
                    title="No open services"
                    description="Active Fua and Keja items will group here by service."
                    darkMode={theme.isDark}
                    mutedSurface={theme.mutedSurface}
                    textPrimary={theme.textPrimary}
                    textSecondary={theme.textSecondary}
                    primary={theme.primary}
                    border={theme.border}
                  />
                ) : (
                  <View style={styles.makeTripsActiveList}>
                    {fuaActive.length > 0 ? (
                      <>
                        {renderServiceHeader('Fua', 'washer', SERVICE_DOT_COLORS.laundry, fuaActive.length)}
                        {fuaActive.map((trip) => (
                          <View
                            key={`svc-fua-${trip.id}`}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.laundry}22` }]}>
                              <AppIcon name="washer" size={18} color={SERVICE_DOT_COLORS.laundry} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {trip.sub}
                                {trip.amount !== '—' ? ` · ${trip.amount}` : ''}
                              </AccessibleText>
                            </View>
                          </View>
                        ))}
                      </>
                    ) : null}
                    {(kejaActive.length > 0 || openRequests.length > 0) ? (
                      <>
                        {renderServiceHeader(
                          'Keja',
                          'home',
                          SERVICE_DOT_COLORS.stay,
                          kejaActive.length + openRequests.length,
                        )}
                        {openRequests.map((req) => (
                          <PressableScale
                            key={`svc-req-${req.id}`}
                            onPress={() => void openListingRequestDetail(req.id)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                              <AppIcon name="home" size={18} color={SERVICE_DOT_COLORS.stay} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {req.listingTitle}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {req.kind === 'tour' ? 'Tour request' : req.kind === 'viewing' ? 'Viewing request' : 'Stay request'}
                              </AccessibleText>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                          </PressableScale>
                        ))}
                        {kejaActive.map((trip) => (
                          <PressableScale
                            key={`svc-keja-${trip.id}`}
                            onPress={() => void openBookedStayDetail(trip.id)}
                            style={[styles.activityCard, nestedChrome(themeMode === 'dark')]}
                          >
                            <View style={[styles.activityIconWell, { backgroundColor: `${SERVICE_DOT_COLORS.stay}22` }]}>
                              <AppIcon name="stays" size={18} color={SERVICE_DOT_COLORS.stay} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                                {trip.title}
                              </AccessibleText>
                              <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                                {trip.sub}
                              </AccessibleText>
                            </View>
                          </PressableScale>
                        ))}
                      </>
                    ) : null}
                  </View>
                )}
              </>
            ) : null}

            {activitySection === 'history' ? (
              <View style={[styles.makeHistoryCard, nestedChrome(themeMode === 'dark'), { borderColor: theme.border }]}>
                {historyItems.length === 0 ? (
                  <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary, padding: 16 }]}>
                    Completed orders appear here.
                  </AccessibleText>
                ) : (
                  historyItems.map((h, i) => {
                    const isStay = 'kind' in h && h.kind === 'stay';
                    const isReq = 'kind' in h && h.kind === 'listing_request';
                    const iconName: AppIconName = isStay || isReq ? 'home' : 'washer';
                    const iconColor = isStay || isReq ? SERVICE_DOT_COLORS.stay : SERVICE_DOT_COLORS.laundry;
                    return (
                      <Pressable
                        key={h.id}
                        onPress={
                          isStay
                            ? () => void openBookedStayDetail(h.id)
                            : isReq
                              ? () => void openListingRequestDetail(h.id)
                              : undefined
                        }
                        style={({ pressed }) => [
                          styles.makeHistoryRow,
                          i < historyItems.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          },
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <View style={[styles.makeHistoryIcon, { backgroundColor: `${iconColor}22` }]}>
                          <AppIcon name={iconName} size={14} color={iconColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AccessibleText style={[styles.makeTripTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                            {h.title}
                          </AccessibleText>
                          <AccessibleText style={[styles.makeTripSub, { color: theme.textSecondary }]}>
                            {h.date}
                          </AccessibleText>
                        </View>
                        <AccessibleText style={[styles.makeHistoryAmount, { color: theme.textSecondary }]}>
                          {h.amount}
                        </AccessibleText>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}
          </ScrollView>
        );

}

export const ActivityTab = memo(ActivityTabInner);
