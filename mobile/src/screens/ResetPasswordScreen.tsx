import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { request } from '../api/client';
import { AlertDialog, Card, Field, GhostButton, PrimaryButton } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

/**
 * Password reset (A04 → A06). The applicant enters their LEAN ID; the server
 * sends a reset link to that account's registered SPOC email and always answers
 * the same way, so the screen cannot be used to discover which IDs exist. The
 * link-sent state confirms where it went.
 */
export default function ResetPasswordScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [leanId, setLeanId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!leanId.trim()) {
      setError('Enter your LEAN ID.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Always 200 — the confirmation is the same whether or not the ID exists.
      await request('/api/auth/forgot-password', { method: 'POST', anonymous: true, body: { userId: leanId.trim() } });
      setSent(true);
    } catch {
      setDialog('The reset could not be started. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + space(6) }]}>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.sub}>Recover access to your LEAN account.</Text>

        {sent ? (
          <Card capped>
            <View style={styles.tickWrap}><View style={styles.tick}><Text style={styles.tickMark}>✓</Text></View></View>
            <Text style={styles.h}>Check your email</Text>
            <Text style={styles.p}>
              If {leanId.trim()} is a registered account, a reset link has been sent to its SPOC
              email address. Open the link to set a new password.
            </Text>
            <Text style={styles.hint}>The link expires shortly for security. Check spam if it does not arrive.</Text>
            <PrimaryButton label="Back to sign in" onPress={() => navigation.goBack()} style={styles.mt} />
          </Card>
        ) : (
          <Card>
            <Field
              label="LEAN ID"
              required
              placeholder="LEAN-XX-YYYY-000000"
              autoCapitalize="characters"
              value={leanId}
              onChangeText={setLeanId}
              error={error}
              hint="The reset link goes to that account's registered SPOC email."
            />
            <PrimaryButton label="Send reset link" busy={busy} onPress={() => void submit()} style={styles.mt} />
            <GhostButton label="Back to sign in" onPress={() => navigation.goBack()} style={styles.mt} />
          </Card>
        )}
      </ScrollView>

      <AlertDialog visible={dialog !== null} title="Could not send" text={dialog ?? ''} onClose={() => setDialog(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  page: { padding: space(5), paddingBottom: space(10) },
  mt: { marginTop: space(3) },

  title: { fontSize: type.hero, fontWeight: '800', color: colour.text },
  sub: { fontSize: type.small, color: colour.body, marginTop: space(1), marginBottom: space(5) },

  tickWrap: { alignItems: 'center', marginBottom: space(2) },
  tick: {
    width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colour.greenTint,
    borderWidth: 1, borderColor: colour.greenLine, alignItems: 'center', justifyContent: 'center',
  },
  tickMark: { fontSize: 28, color: colour.green, fontWeight: '800' },
  h: { fontSize: type.title, fontWeight: '800', color: colour.text, textAlign: 'center' },
  p: { fontSize: type.small, color: colour.body, textAlign: 'center', marginTop: space(2), lineHeight: 20 },
  hint: { fontSize: type.tiny, color: colour.muted, textAlign: 'center', marginTop: space(2) },
});
