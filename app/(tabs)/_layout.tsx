import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/components/AppTheme';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F47E52',
        tabBarInactiveTintColor: colors.tabInactive,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bar,
          borderTopWidth: scheme === 'dark' ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: scheme === 'dark' ? 0 : 0.1,
          shadowRadius: 8,
          height: 70 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 20),
          paddingTop: 12,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <TabBarIcon name="bell" color={color} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="gear" color={color} />,
        }}
      />
    </Tabs>
  );
}
