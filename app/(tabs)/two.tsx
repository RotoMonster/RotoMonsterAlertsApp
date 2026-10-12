import { useMemo, useState } from 'react';
import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette, ThemePreference, useAppTheme } from '@/components/AppTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert as RNAlert,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const SERVER_URL = 'https://alerts.rotomonster.com';
const DEFAULT_HOURS = 12;
const HOUR_OPTIONS = [6, 12, 24, 48, 72];
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const STORAGE_KEYS = {
  USER_CODE: '@rm_alerts:user_code',
  MESSAGES: '@rm_alerts:messages',
  CLEARED_AT: '@rm_alerts:cleared_at',
  HOURS: '@rm_alerts:hours',
  DISMISSED: '@rm_alerts:dismissed',
  MY_PLAYERS: '@rm_alerts:my_players',
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c, preference, setPreference } = useAppTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [myPlayersOnly, setMyPlayersOnly] = useState(false);
  const [linked, setLinked] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [staffNotifications, setStaffNotifications] = useState(true);
  const [staffBusy, setStaffBusy] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadSettings();
    }, [])
  );

  const loadSettings = async () => {
    try {
      const [storedCode, storedHours, storedMyPlayers] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER_CODE),
        AsyncStorage.getItem(STORAGE_KEYS.HOURS),
        AsyncStorage.getItem(STORAGE_KEYS.MY_PLAYERS),
      ]);

      setMyPlayersOnly(storedMyPlayers === 'true');

      setRegisteredCode(storedCode);

      const parsed = storedHours ? parseInt(storedHours, 10) : DEFAULT_HOURS;
      setHours(Number.isFinite(parsed) ? parsed : DEFAULT_HOURS);

      if (storedCode) {
        try {
          const response = await fetch(`${SERVER_URL}/api/device/${storedCode}/notifications-status`);
          const data = await response.json();
          if (data.success) {
            setNotificationsEnabled(data.enabled);
            if (typeof data.myPlayersOnly === 'boolean') {
              setMyPlayersOnly(data.myPlayersOnly);
              await AsyncStorage.setItem(STORAGE_KEYS.MY_PLAYERS, String(data.myPlayersOnly));
            }
            if (typeof data.linked === 'boolean') setLinked(data.linked);
            setIsStaff(data.isStaff === true);
            if (typeof data.staffNotifications === 'boolean') setStaffNotifications(data.staffNotifications);
          }
        } catch (error) {
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const changeHours = async (value: number) => {
    setHours(value);
    await AsyncStorage.setItem(STORAGE_KEYS.HOURS, String(value));
  };

  const toggleNotifications = async (value: boolean) => {
    if (!registeredCode) return;

    setNotificationsEnabled(value);
    setBusy(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/device/${registeredCode}/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: value }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
    } catch (error) {
      setNotificationsEnabled(!value);
      RNAlert.alert('Error', 'Could not update the notification setting.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStaffNotifications = async (value: boolean) => {
    if (!registeredCode) return;

    setStaffNotifications(value);
    setStaffBusy(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/device/${registeredCode}/staff-notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: value }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
    } catch (error) {
      setStaffNotifications(!value);
      RNAlert.alert('Error', 'Could not update the staff notification setting.');
    } finally {
      setStaffBusy(false);
    }
  };

  const changeMyPlayers = async (value: boolean) => {
    const previous = myPlayersOnly;
    setMyPlayersOnly(value);
    await AsyncStorage.setItem(STORAGE_KEYS.MY_PLAYERS, String(value));

    if (!registeredCode) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/device/${registeredCode}/filter`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myPlayersOnly: value }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
    } catch (error) {
      setMyPlayersOnly(previous);
      await AsyncStorage.setItem(STORAGE_KEYS.MY_PLAYERS, String(previous));
      RNAlert.alert('Error', 'Could not update the player alerts setting.');
    }
  };

  const unregister = () => {
    RNAlert.alert(
      'Unregister',
      'You will stop receiving alerts on this device and need your code to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unregister',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([
              STORAGE_KEYS.USER_CODE,
              STORAGE_KEYS.MESSAGES,
              STORAGE_KEYS.CLEARED_AT,
              STORAGE_KEYS.DISMISSED,
              STORAGE_KEYS.MY_PLAYERS,
            ]);
            setRegisteredCode(null);
            setIsStaff(false);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.sectionLabel}>SHOW MESSAGES FROM THE PAST</Text>
      <View style={styles.hoursRow}>
        {HOUR_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.hourPill, hours === option && styles.hourPillActive]}
            onPress={() => changeHours(option)}
          >
            <Text style={[styles.hourPillText, hours === option && styles.hourPillTextActive]}>
              {option}h
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>PLAYER ALERTS</Text>
      <View style={styles.hoursRow}>
        {[
          { value: false, label: 'All players' },
          { value: true, label: 'My players' },
        ].map((option) => (
          <TouchableOpacity
            key={option.label}
            style={[styles.hourPill, myPlayersOnly === option.value && styles.hourPillActive]}
            onPress={() => changeMyPlayers(option.value)}
          >
            <Text style={[styles.hourPillText, myPlayersOnly === option.value && styles.hourPillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {myPlayersOnly && !linked && (
        <Text style={styles.helperText}>
          Your code isn't linked to a Basketball Monster account yet, so player alerts won't show until it is.
        </Text>
      )}

      <Text style={styles.sectionLabel}>APPEARANCE</Text>
      <View style={styles.hoursRow}>
        {THEME_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.hourPill, preference === option.value && styles.hourPillActive]}
            onPress={() => setPreference(option.value)}
          >
            <Text style={[styles.hourPillText, preference === option.value && styles.hourPillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Push notifications</Text>
          <Text style={styles.rowSubtitle}>
            Messages still appear in the list when this is off.
          </Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={toggleNotifications}
          disabled={busy || !registeredCode}
          trackColor={{ true: '#E66000', false: c.control }}
        />
      </View>
      {isStaff && (
        <View style={[styles.row, styles.rowSpaced]}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Staff alerts</Text>
            <Text style={styles.rowSubtitle}>
              {notificationsEnabled
                ? 'Monitor and support alerts. They still appear in the list when this is off.'
                : 'Turn on push notifications to get staff alerts.'}
            </Text>
          </View>
          <Switch
            value={staffNotifications && notificationsEnabled}
            onValueChange={toggleStaffNotifications}
            disabled={staffBusy || !registeredCode || !notificationsEnabled}
            trackColor={{ true: '#E66000', false: c.control }}
          />
        </View>
      )}

      <Text style={styles.sectionLabel}>DEVICE</Text>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Registered as</Text>
          <Text style={styles.rowSubtitle}>{registeredCode || 'Not registered'}</Text>
        </View>
      </View>

      {!!registeredCode && (
        <TouchableOpacity style={styles.dangerButton} onPress={unregister}>
          <Text style={styles.dangerButtonText}>Unregister this device</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, padding: 16 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: c.muted,
    marginTop: 20,
    marginBottom: 8,
  },

  hoursRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: c.control,
    backgroundColor: c.card,
  },
  hourPillActive: { backgroundColor: '#E66000', borderColor: '#E66000' },
  hourPillText: { fontSize: 14, fontWeight: '700', color: '#E66000' },
  hourPillTextActive: { color: '#fff' },
  helperText: { fontSize: 13, color: c.sub, marginTop: 8, lineHeight: 18 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderRadius: 10,
    padding: 14,
  },
  rowSpaced: { marginTop: 8 },
  rowText: { flex: 1, paddingRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  rowSubtitle: { fontSize: 13, color: c.sub, marginTop: 2 },

  dangerButton: {
    marginTop: 28,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.dangerBorder,
    backgroundColor: c.dangerBg,
    alignItems: 'center',
  },
  dangerButtonText: { fontSize: 15, fontWeight: '600', color: c.danger },
});
