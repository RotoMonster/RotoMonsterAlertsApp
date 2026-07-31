import { useEffect, useState } from 'react';
import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
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

const STORAGE_KEYS = {
  USER_CODE: '@rm_alerts:user_code',
  MESSAGES: '@rm_alerts:messages',
  CLEARED_AT: '@rm_alerts:cleared_at',
  HOURS: '@rm_alerts:hours',
};

export default function SettingsScreen() {
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadSettings();
    }, [])
  );

  const loadSettings = async () => {
    try {
      const [storedCode, storedHours] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER_CODE),
        AsyncStorage.getItem(STORAGE_KEYS.HOURS),
      ]);

      setRegisteredCode(storedCode);

      const parsed = storedHours ? parseInt(storedHours, 10) : DEFAULT_HOURS;
      setHours(Number.isFinite(parsed) ? parsed : DEFAULT_HOURS);

      if (storedCode) {
        try {
          const response = await fetch(`${SERVER_URL}/api/device/${storedCode}/notifications-status`);
          const data = await response.json();
          if (data.success) setNotificationsEnabled(data.enabled);
        } catch (error) {
          // Offline - leave the switch showing whatever it last showed.
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
            ]);
            setRegisteredCode(null);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
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
          trackColor={{ true: '#E66000', false: '#cbd5e1' }}
        />
      </View>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#94a3b8',
    marginTop: 20,
    marginBottom: 8,
  },

  hoursRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  hourPillActive: { backgroundColor: '#E66000', borderColor: '#E66000' },
  hourPillText: { fontSize: 14, fontWeight: '700', color: '#E66000' },
  hourPillTextActive: { color: '#fff' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  rowSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },

  dangerButton: {
    marginTop: 28,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
  },
  dangerButtonText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
});
