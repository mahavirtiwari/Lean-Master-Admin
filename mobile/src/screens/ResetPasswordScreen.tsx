import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { request } from '../api/client';
import { AlertDialog, Card, Field } from '../components/ui';
import { AuthScaffold } from '../components/AuthScaffold';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

/**
 * Password reset (A04 → A06). The applicant enters their LEAN ID; a reset link
 * goes to the account's registered SPOC email. The server answers the same way
 * whether or not the ID exists, so the screen cannot enumerate accounts.
 */
export default function ResetPasswordScreen({ navigation }: Props): React.JSX.Element {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!id.trim()) return setError('Enter your LEAN ID.');
    setBusy(true);
    setError(null);
    try {
      await request('/api/auth/forgot-password', { method: 'POST', anonymous: true, body: { userId: id.trim() } });
      setSent(true);
    } catch {
      setDialog('The reset could not be started. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthScaffold title="Check your" accent="email">
        <Card capped>
          <View style={styles.tickWrap}><View style={styles.tick}><Text style={styles.tickMark}>✓</Text></View></View>
          <Text style={styles.doneText}>
            If {id.trim()} is a registered account, a reset link has been sent to its registered SPOC
            email address. Open the link to set a new password.
          </Text>
          <Text style={styles.hint}>The link expires shortly. Check your spam folder if it does not arrive.</Text>
        </Card>
        <Pressable style={styles.primary} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.primaryText}>Back to sign in</Text>
        </Pressable>
      </AuthScaffold>
    );
  }

  return (
    <>
      <AuthScaffold title="Reset password" subtitle="Recover access to your LEAN account">
        <Card>
          <Field
            label="LEAN ID or Udyam number"
            required
            value={id}
            onChangeText={setId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Enter here"
            hint="Enter either one — both are accepted"
            error={error}
          />
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && !busy ? styles.pressed : null, busy ? styles.off : null]}
            onPress={submit}
            disabled={busy}
          >
            <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Continue ›'}</Text>
          </Pressable>
        </Card>

        <Card>
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colour.greenTint }]}><Text style={styles.infoGlyph}>🪪</Text></View>
            <View style={styles.flex}>
              <Text style={styles.infoTitle}>You enter a LEAN ID</Text>
              <Text style={styles.infoText}>The reset link goes straight to that account's SPOC email.</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colour.blueTint }]}><Text style={styles.infoGlyph}>🗂️</Text></View>
            <View style={styles.flex}>
              <Text style={styles.infoTitle}>You enter a Udyam number</Text>
              <Text style={styles.infoText}>Every LEAN ID under it is listed with its plant; pick one and the link goes to that plant's SPOC email.</Text>
            </View>
          </View>
        </Card>

        <View style={styles.deliveryBox}>
          <Text style={styles.deliveryText}>The reset link is delivered to the account's registered SPOC email.</Text>
        </View>
      </AuthScaffold>

      <AlertDialog visible={dialog !== null} title="Could not send" text={dialog ?? ''} onClose={() => setDialog(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  primary: { backgroundColor: colour.blue, borderRadius: radius.md, paddingVertical: space(3.5), alignItems: 'center', marginTop: space(2) },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.6 },
  primaryText: { color: colour.surface, fontSize: type.body, fontWeight: '700' },

  tickWrap: { alignItems: 'center', marginBottom: space(2) },
  tick: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colour.greenTint, borderWidth: 1, borderColor: colour.greenLine, alignItems: 'center', justifyContent: 'center' },
  tickMark: { fontSize: 28, color: colour.green, fontWeight: '800' },
  doneText: { fontSize: type.small, color: colour.body, textAlign: 'center', lineHeight: 20 },
  hint: { fontSize: type.tiny, color: colour.muted, textAlign: 'center', marginTop: space(2) },

  infoRow: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  infoIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  infoGlyph: { fontSize: 16 },
  infoTitle: { fontSize: type.small, fontWeight: '700', color: colour.text },
  infoText: { fontSize: type.tiny, color: colour.muted, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colour.line, marginVertical: space(3) },

  deliveryBox: { backgroundColor: colour.blueTint, borderWidth: 1, borderColor: colour.blueLine, borderRadius: radius.md, padding: space(3.5) },
  deliveryText: { fontSize: type.tiny, color: colour.blue, lineHeight: 18 },
});
