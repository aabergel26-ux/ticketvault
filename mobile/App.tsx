import { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import type { RootStackParamList, MainTabParamList } from './lib/navigation';
import { loadSession, clearSession, type Session } from './lib/auth';
import { clearCache } from './lib/cache';
import { LoginScreen } from './screens/LoginScreen';
import { TicketsScreen } from './screens/TicketsScreen';
import { TicketDetailScreen } from './screens/TicketDetailScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { colors } from './lib/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    text: colors.textPrimary,
    primary: colors.accent,
  },
};

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

function MainTabs({ session, onSessionExpired, onSignOut }: {
  session: Session;
  onSessionExpired: () => void;
  onSignOut: () => void;
}) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Tickets"
        options={{ tabBarIcon: ({ color }) => <TabIcon symbol="🎟️" color={color} /> }}
      >
        {() => <TicketsScreen session={session} onSessionExpired={onSessionExpired} />}
      </Tab.Screen>
      <Tab.Screen
        name="Settings"
        options={{ tabBarIcon: ({ color }) => <TabIcon symbol="⚙️" color={color} /> }}
      >
        {() => <SettingsScreen session={session} onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setCheckingSession(false);
    });
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearSession();
    clearCache();
    setSession(null);
  }, []);

  const handleSignOut = useCallback(() => {
    clearSession();
    clearCache();
    setSession(null);
  }, []);

  if (checkingSession) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!session ? (
            <Stack.Screen name="Login">
              {() => <LoginScreen onLogin={setSession} />}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen name="Main">
                {() => (
                  <MainTabs
                    session={session}
                    onSessionExpired={handleSessionExpired}
                    onSignOut={handleSignOut}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="TicketDetail"
                component={TicketDetailScreen}
                options={{
                  headerShown: true,
                  title: '',
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.textPrimary,
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
