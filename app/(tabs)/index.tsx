import React from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert as RNAlert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
  Text,
  RefreshControl,
  FlatList,
} from 'react-native';

const SERVER_URL = 'https://alerts.rotomonster.com';
const REFRESH_INTERVAL = 60 * 1000;
const DEFAULT_HOURS = 12;

export const STORAGE_KEYS = {
  USER_CODE: '@rm_alerts:user_code',
  MESSAGES: '@rm_alerts:messages',
  CLEARED_AT: '@rm_alerts:cleared_at',
  HOURS: '@rm_alerts:hours',
};

const SPORTS: { key: string; label: string; sportId: number | null }[] = [
  { key: 'all', label: 'All', sportId: null },
  { key: 'nba', label: 'NBA', sportId: 1 },
  { key: 'mlb', label: 'MLB', sportId: 2 },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface MonitorMessage {
  message_id: string;
  sport_id: number | null;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export default function HomeScreen() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredCode, setRegisteredCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<MonitorMessage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [activeSport, setActiveSport] = useState('all');
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [hours, setHours] = useState(DEFAULT_HOURS);

  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    initializeApp();
    setupNotificationListeners();

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);

  // Settings live on the other tab, so re-read them whenever this one is shown.
  useFocusEffect(
    React.useCallback(() => {
      restoreState();
    }, [])
  );

  const initializeApp = async () => {
    await registerForPushNotifications();
    await restoreState();
  };

  const restoreState = async () => {
    try {
      const [storedCode, storedCleared, storedHours] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER_CODE),
        AsyncStorage.getItem(STORAGE_KEYS.CLEARED_AT),
        AsyncStorage.getItem(STORAGE_KEYS.HOURS),
      ]);

      setClearedAt(storedCleared);
      const parsedHours = storedHours ? parseInt(storedHours, 10) : DEFAULT_HOURS;
      const effectiveHours = Number.isFinite(parsedHours) ? parsedHours : DEFAULT_HOURS;
      setHours(effectiveHours);

      if (storedCode) {
        setRegisteredCode(storedCode);
        setIsRegistered(true);
        await loadMessages(effectiveHours);
        startAutoRefresh(effectiveHours);
      } else {
        setIsRegistered(false);
        setRegisteredCode(null);
        setMessages([]);
        if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      }
    } catch (error) {
      console.error('Error restoring state:', error);
    }
  };

  const setupNotificationListeners = () => {
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      loadMessagesUsingStoredHours();
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      // Tapping a notification that carries a url opens it directly.
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url) openUrl(url);
      loadMessagesUsingStoredHours();
    });
  };

  const loadMessagesUsingStoredHours = async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.HOURS);
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_HOURS;
    loadMessages(Number.isFinite(parsed) ? parsed : DEFAULT_HOURS);
  };

  const registerForPushNotifications = async () => {
    if (!Device.isDevice) {
      setPushToken('simulator_token_' + Math.random().toString(36).substring(7));
      return;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        RNAlert.alert('Permission Required', 'Notifications are needed to alert you about site issues.');
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#E66000',
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        RNAlert.alert('Configuration Error', 'Project ID not configured.');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      setPushToken(tokenData.data);
    } catch (error) {
      console.error('Error getting push token:', error);
      RNAlert.alert('Error', 'Failed to get notification token.');
    }
  };

  const handleRegister = async () => {
    if (!code.trim()) {
      RNAlert.alert('Error', 'Please enter your code');
      return;
    }
    if (!pushToken) {
      RNAlert.alert('Error', 'Not ready yet, give it a moment.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), pushToken }),
      });

      const result = await response.json();

      if (result.success) {
        const upperCode = code.trim().toUpperCase();
        setIsRegistered(true);
        setRegisteredCode(upperCode);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_CODE, upperCode);
        await loadMessages(hours);
        startAutoRefresh(hours);
      } else {
        RNAlert.alert('Error', result.error || 'Registration failed');
      }
    } catch (error) {
      RNAlert.alert('Connection Error', 'Could not reach the alerts server.');
    } finally {
      setIsLoading(false);
    }
  };

  // Everything is fetched once and filtered on the device, so switching tabs
  // is instant and works offline against the cache.
  const loadMessages = async (forHours: number, showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/messages?hours=${forHours}`);
      const data = await response.json();

      if (data.success) {
        setMessages(data.messages);
        setIsOnline(true);
        await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(data.messages));
      }
    } catch (error) {
      setIsOnline(false);
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
        if (cached) setMessages(JSON.parse(cached));
      } catch (cacheError) {
        console.error('Error loading cached messages:', cacheError);
      }
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  };

  const startAutoRefresh = (forHours: number) => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    refreshIntervalRef.current = setInterval(() => loadMessages(forHours), REFRESH_INTERVAL);
  };

  // Clear hides everything currently visible by remembering the moment it was
  // pressed. Nothing is deleted, so View All brings it all back.
  const handleClear = async () => {
    const now = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEYS.CLEARED_AT, now);
    setClearedAt(now);
  };

  const handleViewAll = async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.CLEARED_AT);
    setClearedAt(null);
  };

  const openUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error('Could not open url:', error);
    }
  };

  const visibleMessages = messages.filter((m) => {
    const sport = SPORTS.find((s) => s.key === activeSport);
    if (sport?.sportId != null && m.sport_id !== sport.sportId) return false;
    if (clearedAt && new Date(m.created_at) <= new Date(clearedAt)) return false;
    return true;
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  };

  const sportLabel = (sportId: number | null) => {
    if (sportId === 1) return 'NBA';
    if (sportId === 2) return 'MLB';
    return null;
  };

  // Turns bare urls in the message body into tappable text.
  const renderBody = (body: string) => {
    const parts = body.split(URL_PATTERN);
    return (
      <Text style={styles.messageBody}>
        {parts.map((part, i) =>
          URL_PATTERN.test(part) ? (
            <Text key={i} style={styles.inlineLink} onPress={() => openUrl(part)}>
              {part}
            </Text>
          ) : (
            <Text key={i}>{part}</Text>
          )
        )}
      </Text>
    );
  };

  const renderMessage = ({ item }: { item: MonitorMessage }) => {
    const label = sportLabel(item.sport_id);

    return (
      <View style={styles.messageCard}>
        <View style={styles.messageHeader}>
          {label && (
            <View style={styles.sportPill}>
              <Text style={styles.sportPillText}>{label}</Text>
            </View>
          )}
          <Text style={styles.timestamp}>{formatTimestamp(item.created_at)}</Text>
        </View>

        <Text style={styles.messageTitle}>{item.title}</Text>

        {!!item.body && renderBody(item.body)}

        {!!item.url && (
          <TouchableOpacity style={styles.linkButton} onPress={() => openUrl(item.url!)}>
            <Text style={styles.linkButtonText}>Open link</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (!isRegistered) {
    return (
      <KeyboardAvoidingView
        style={styles.registerContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.registerTitle}>RotoMonster Alerts</Text>
        <Text style={styles.registerSubtitle}>Enter the code you were given to start receiving alerts.</Text>

        <TextInput
          style={styles.codeInput}
          placeholder="Code"
          placeholderTextColor="#94a3b8"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Register</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {SPORTS.map((sport) => (
          <TouchableOpacity
            key={sport.key}
            style={[styles.tab, activeSport === sport.key && styles.tabActive]}
            onPress={() => setActiveSport(sport.key)}
          >
            <Text style={[styles.tabText, activeSport === sport.key && styles.tabTextActive]}>
              {sport.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.toolbarInfo}>
          Past {hours}h{!isOnline ? ' · offline' : ''}
        </Text>
        <View style={styles.toolbarActions}>
          {clearedAt ? (
            <TouchableOpacity style={styles.toolbarButton} onPress={handleViewAll}>
              <Text style={styles.toolbarButtonText}>View All</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.toolbarButton} onPress={handleClear}>
              <Text style={styles.toolbarButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={visibleMessages}
        keyExtractor={(item) => item.message_id}
        renderItem={renderMessage}
        contentContainerStyle={visibleMessages.length === 0 && styles.emptyWrap}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadMessages(hours, true)} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {clearedAt ? 'Messages cleared. Press View All to show them again.' : 'No messages.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  registerContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#f8fafc',
  },
  registerTitle: { fontSize: 26, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  registerSubtitle: { fontSize: 15, color: '#64748b', marginBottom: 24, lineHeight: 21 },
  codeInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    backgroundColor: '#fff',
    marginBottom: 16,
    color: '#1e293b',
  },
  primaryButton: {
    backgroundColor: '#E66000',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#E66000' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#E66000' },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toolbarInfo: { fontSize: 13, color: '#64748b' },
  toolbarActions: { flexDirection: 'row' },
  toolbarButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  toolbarButtonText: { fontSize: 13, fontWeight: '600', color: '#475569' },

  messageCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#E66000',
  },
  messageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sportPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(230, 96, 0, 0.12)',
    marginRight: 8,
  },
  sportPillText: { fontSize: 11, fontWeight: '700', color: '#E66000' },
  timestamp: { fontSize: 12, color: '#94a3b8', marginLeft: 'auto' },
  messageTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  messageBody: { fontSize: 14, color: '#475569', lineHeight: 20 },
  inlineLink: { color: '#2563eb', textDecorationLine: 'underline' },
  linkButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  linkButtonText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },

  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 32 },
});
