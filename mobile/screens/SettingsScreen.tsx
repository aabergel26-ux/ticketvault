import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import type { Session } from '../lib/auth';
import { signOut } from '../lib/api';
import { colors } from '../lib/theme';

interface Props {
  session: Session;
  onSignOut: () => void;
}

export function SettingsScreen({ session, onSignOut }: Props) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    // Best-effort — revoke server-side, but clear local session regardless.
    await signOut(session.sessionToken);
    setSigningOut(false);
    onSignOut();
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Connected account</Text>
        <View style={styles.accountRow}>
          <Text style={styles.accountEmail}>{session.email}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={signingOut}>
        {signingOut ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    gap: 24,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 8,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  accountEmail: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
