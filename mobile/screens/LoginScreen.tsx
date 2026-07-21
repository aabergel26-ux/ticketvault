import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getRedirectUri, parseAuthCallback, saveSession, type Session } from '../lib/auth';
import { API_BASE_URL } from '../lib/api';
import { colors } from '../lib/theme';

interface Props {
  onLogin: (session: Session) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [connecting, setConnecting] = useState(false);
  // Guards against handling the same deep link twice (once from the
  // 'url' event, once from getInitialURL on cold start).
  const handledRef = useRef(false);

  useEffect(() => {
    async function handleUrl(url: string) {
      if (handledRef.current) return;
      const session = parseAuthCallback(url);
      if (!session) return;

      handledRef.current = true;
      await WebBrowser.dismissBrowser().catch(() => {});
      await saveSession(session);
      setConnecting(false);
      onLogin(session);
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setConnecting(true);
    handledRef.current = false;
    const redirectUri = getRedirectUri();
    const authUrl = `${API_BASE_URL}/api/auth/google?mobile=1&mobileRedirect=${encodeURIComponent(redirectUri)}`;
    try {
      await WebBrowser.openBrowserAsync(authUrl);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🎟️</Text>
      <Text style={styles.title}>TicketVault</Text>
      <Text style={styles.subtitle}>
        Connect your Gmail to see all your ticket confirmations in one place.
      </Text>

      <TouchableOpacity style={styles.button} onPress={handleConnect} disabled={connecting}>
        {connecting ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={styles.buttonText}>Connect Gmail</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  logo: {
    fontSize: 56,
    marginBottom: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
});
