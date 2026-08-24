import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, OfflineError } from '../api/client';
import { AlertDialog, Card, Field } from '../components/ui';
import { AuthScaffold } from '../components/AuthScaffold';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

/** Applicant sign-in (A02): LEAN ID + password over the MCLS auth scaffold. */
export default function SignInScreen({ navigation }: Props): React.JSX.Element {
  const { signIn } = useApp();

  const [leanId, setLeanId] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  async function submit(): Promise<void> {
    if (!leanId.trim()) return setDialog({ title: 'Please check', text: 'Enter your LEAN ID.' });
    if (!password) return setDialog({ title: 'Please check', text: 'Enter your password.' });

    setBusy(true);
    try {
      await signIn(leanId, password);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (error) {
      setDialog({
        title: error instanceof OfflineError ? 'No connection' : 'Could not sign in',
        text:
          error instanceof ApiError
            ? error.message
            : 'Signing in needs a connection. Try again once you are back online.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthScaffold title="Welcome" subtitle="Sign in to your LEAN account">
        <Card>
          <Field
            label="LEAN ID"
            required
            value={leanId}
            onChangeText={setLeanId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="LEAN-MH-2025-00456"
          />
          <Field
            label="Password"
            required
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter your password"
          />

          <View style={styles.row}>
            <Pressable style={styles.keep} onPress={() => setKeep((k) => !k)}>
              <View style={[styles.box, keep ? styles.boxOn : null]}>
                {keep ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={styles.keepText}>Keep me signed in</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ResetPassword')}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.signin, pressed && !busy ? styles.pressed : null, busy ? styles.off : null]}
            onPress={submit}
            disabled={busy}
          >
            <Text style={styles.signinText}>{busy ? 'Signing in…' : 'Sign in ›'}</Text>
          </Pressable>
        </Card>

        <Text style={styles.monitored}>Registered enterprises only. Access is monitored.</Text>

        <Card>
          <Text style={styles.newTitle}>New User</Text>
          <Text style={styles.newSub}>If you are a first-time user, register your enterprise below.</Text>
          <Pressable
            style={({ pressed }) => [styles.register, pressed ? styles.pressed : null]}
            onPress={() => navigation.navigate('RegisterLanding')}
          >
            <Text style={styles.registerText}>Register Now</Text>
          </Pressable>
        </Card>
      </AuthScaffold>

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(4) },
  keep: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  box: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colour.input,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colour.blue, borderColor: colour.blue },
  check: { color: colour.surface, fontSize: 12, fontWeight: '800' },
  keepText: { fontSize: type.small, color: colour.body },
  forgot: { fontSize: type.small, fontWeight: '700', color: colour.blue },

  signin: { backgroundColor: colour.blue, borderRadius: radius.md, paddingVertical: space(3.5), alignItems: 'center' },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.6 },
  signinText: { color: colour.surface, fontSize: type.body, fontWeight: '700' },

  monitored: { fontSize: type.tiny, color: colour.muted, textAlign: 'center' },

  newTitle: { fontSize: type.title, fontWeight: '800', color: colour.text },
  newSub: { fontSize: type.small, color: colour.body, marginTop: space(1), marginBottom: space(4), lineHeight: 20 },
  register: { backgroundColor: colour.green, borderRadius: radius.md, paddingVertical: space(3.5), alignItems: 'center' },
  registerText: { color: colour.surface, fontSize: type.body, fontWeight: '700' },
});
