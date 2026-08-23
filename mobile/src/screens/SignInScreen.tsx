import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, OfflineError } from '../api/client';
import { AlertDialog, Card, Field, GhostButton, OfflineBanner, PrimaryButton } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

export default function SignInScreen({ navigation }: Props): React.JSX.Element {
  const { signIn, online, queued } = useApp();

  const [leanId, setLeanId] = useState('');
  const [password, setPassword] = useState('');
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.brandTitle}>MSME Competitive{'\n'}(LEAN) Scheme</Text>
          <View style={styles.rule} />
          <Text style={styles.brandSub}>
            Ministry of Micro, Small &amp; Medium Enterprises, Government of India
          </Text>
        </View>

        <Card capped>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.sub}>Sign in to your LEAN account with the ID sent to your SPOC email.</Text>

          <Field
            label="LEAN ID"
            required
            value={leanId}
            onChangeText={setLeanId}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="LEAN-MH-2025-00456"
            hint="Sent to your SPOC email when registration completed"
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

          <PrimaryButton label="Sign in" onPress={submit} busy={busy} />
          <GhostButton
            label="Forgot password?"
            onPress={() => navigation.navigate('ResetPassword')}
          />
        </Card>

        <Card>
          <Text style={styles.newLabel}>NOT REGISTERED YET?</Text>
          <Text style={styles.sub}>
            Register your enterprise with its Udyam number. One registration covers Bronze, Silver
            and Gold.
          </Text>
          <GhostButton
            label="Register your enterprise"
            onPress={() => navigation.navigate('RegisterLanding')}
          />
        </Card>
      </ScrollView>

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  page: { padding: space(4), paddingBottom: space(10) },

  brand: { paddingVertical: space(6), alignItems: 'center' },
  brandTitle: {
    fontSize: type.hero,
    fontWeight: '700',
    color: colour.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  rule: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: colour.green,
    marginVertical: space(4),
  },
  brandSub: { fontSize: type.small, color: colour.muted, textAlign: 'center', lineHeight: 19 },

  title: { fontSize: type.title, fontWeight: '700', color: colour.text },
  sub: { fontSize: type.small, color: colour.muted, marginTop: space(2), marginBottom: space(5), lineHeight: 20 },
  newLabel: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.5, color: colour.muted },
});
