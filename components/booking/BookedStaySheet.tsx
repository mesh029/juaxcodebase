import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BnbBooking, PublicListing } from '../../lib/api-types';
import { adaptBnbListing } from '../../lib/listings-adapter';
import { ListingLocationActions } from '../listings/ListingLocationActions';

type Theme = {
  sheet: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  mutedSurface: string;
};

type Props = {
  visible: boolean;
  booking: BnbBooking | null;
  listing: PublicListing | null;
  loading: boolean;
  theme: Theme;
  navigateDisabled?: boolean;
  onClose: () => void;
  onStartTrip: () => void;
  onRequestRide: () => void;
};

export function BookedStaySheet({
  visible,
  booking,
  listing,
  loading,
  theme,
  navigateDisabled,
  onClose,
  onStartTrip,
  onRequestRide,
}: Props) {
  const adapted = listing ? adaptBnbListing(listing) : null;
  const unlocked = adapted && !adapted.locationLocked;
  const coords = adapted?.exactCoords ?? adapted?.coords;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Your booked stay</Text>
            {booking ? (
              <Text style={[styles.lead, { color: theme.textSecondary }]}>
                {booking.listing?.title ?? adapted?.title ?? 'BnB stay'} · {booking.checkIn} → {booking.checkOut}
              </Text>
            ) : null}

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={theme.primary} />
                <Text style={[styles.lead, { color: theme.textSecondary }]}>Loading stay details…</Text>
              </View>
            ) : unlocked && adapted?.exactAddress ? (
              <View style={[styles.unlockCard, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
                <Text style={[styles.cardLabel, { color: theme.textPrimary }]}>Exact address</Text>
                <Text style={[styles.address, { color: theme.textSecondary }]}>{adapted.exactAddress}</Text>
                {adapted.hostPhone ? (
                  <Text style={[styles.host, { color: theme.primary }]}>
                    Host: {adapted.hostName ?? 'Contact'} · {adapted.hostPhone}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.lead, { color: theme.textMuted }]}>
                Address unlocks after payment is confirmed.
              </Text>
            )}

            {unlocked && coords ? (
              <ListingLocationActions
                title={adapted!.title}
                coords={coords}
                unlocked
                theme={theme}
                onNavigate={onStartTrip}
                onRequestRide={onRequestRide}
                navigateDisabled={navigateDisabled}
              />
            ) : null}

            {unlocked ? (
              <Pressable
                style={[styles.cta, { backgroundColor: theme.primary, opacity: navigateDisabled ? 0.65 : 1 }]}
                disabled={navigateDisabled}
                onPress={onStartTrip}
              >
                <Text style={styles.ctaText}>Start trip · live navigation</Text>
                <Text style={styles.ctaSub}>See your position move on the map with updated ETA</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Close</Text>
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
    paddingBottom: 28,
    maxHeight: '88%',
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800' },
  lead: { fontSize: 14, lineHeight: 20 },
  loadingBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  unlockCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginTop: 4,
  },
  cardLabel: { fontSize: 14, fontWeight: '700' },
  address: { fontSize: 14, lineHeight: 20 },
  host: { fontSize: 13, marginTop: 2 },
  cta: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginTop: 4,
    gap: 4,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ctaSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  cancelText: { fontSize: 15 },
});
