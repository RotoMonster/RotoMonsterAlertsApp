import React from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const DEFAULT_COLOR = '#475569';

const SPORTS: { key: string; label: string; sportId: number | null; color: string; tab: boolean }[] = [
  { key: 'all', label: 'All', sportId: null, color: DEFAULT_COLOR, tab: true },
  { key: 'nba', label: 'NBA', sportId: 1, color: '#ff8833', tab: true },
  { key: 'mlb', label: 'MLB', sportId: 2, color: '#2d7a3e', tab: false },
  { key: 'nfl', label: 'NFL', sportId: 3, color: '#8b5a2b', tab: false },
  { key: 'nhl', label: 'NHL', sportId: 4, color: '#2563eb', tab: false },
];

const LEVELS: Record<string, { label: string; color: string }> = {
  low: { label: 'LOW', color: '#8c8c8c' },
  medium: { label: 'MEDIUM', color: '#6699ff' },
  high: { label: 'HIGH', color: '#e68a00' },
  monster: { label: 'MONSTER', color: '#cc3300' },
};

const sportFor = (sportId: number | null) =>
  sportId == null ? null : SPORTS.find((s) => s.sportId === sportId) ?? null;

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
  level?: string | null;
  created_at: string;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
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
    const sport = sportFor(item.sport_id);
    const color = sport?.color ?? DEFAULT_COLOR;
    const level = item.level ? LEVELS[item.level] : undefined;

    return (
      <View style={[styles.messageCard, { borderColor: color }]}>
        <View style={styles.messageHeader}>
          {sport && (
            <View style={[styles.sportPill, { backgroundColor: `${color}1F` }]}>
              <Text style={[styles.sportPillText, { color }]}>{sport.label}</Text>
            </View>
          )}
          <Text style={styles.timestamp}>{formatTimestamp(item.created_at)}</Text>
          <View style={styles.headerSpacer} />
          {level && (
            <View style={[styles.levelBadge, { backgroundColor: level.color }]}>
              <Text style={styles.levelBadgeText}>{level.label}</Text>
            </View>
          )}
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
        style={[styles.registerContainer, { paddingTop: insets.top }]}
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.tabs}>
        {SPORTS.filter((s) => s.tab).map((sport) => {
          const active = activeSport === sport.key;
          return (
            <TouchableOpacity
              key={sport.key}
              style={[styles.tab, active && { borderBottomColor: sport.color }]}
              onPress={() => setActiveSport(sport.key)}
            >
              <Text style={[styles.tabText, active && { color: sport.color }]}>
                {sport.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  tabText: { fontSize: 15, fontWeight: '600', color: '#64748b' },

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
    borderWidth: 1.5,
  },
  messageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sportPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  sportPillText: { fontSize: 11, fontWeight: '700' },
  timestamp: { fontSize: 12, color: '#94a3b8' },
  headerSpacer: { flex: 1 },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  levelBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
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
