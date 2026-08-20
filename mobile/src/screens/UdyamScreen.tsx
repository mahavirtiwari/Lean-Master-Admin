import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, OfflineError } from '../api/client';
import { verifyUdyam } from '../api/registration';
import { AlertDialog, Card, Field, OfflineBanner, PrimaryButton, StepHead } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Udyam'>;

const digits = (value: string, max: number): string => value.replace(/\D+/g, '').slice(0, max);

export default function UdyamScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, saveDraft } = useApp();

  const [udyam, setUdyam] = useState('');
  const [mobile, setMobile] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  const mobileError =
    mobile.length === 0
      ? null
      : mobile.length < 10
        ? 'Enter all 10 digits.'
        : /^[6-9]\d{9}$/.test(mobile)
          ? null
          : 'A mobile number starts with 6, 7, 8 or 9.';

  async function validate(): Promise<void> {
    if (!udyam.trim()) return setDialog({ title: 'Please check', text: 'Enter the Udyam Registration Number.' });
    if (mobileError || mobile.length !== 10) {
      return setDialog({ title: 'Please check', text: mobileError ?? 'Enter the registered mobile number.' });
    }
    if (!authorised) {
      return setDialog({
        title: 'Please check',
        text: 'Please confirm you are authorised to register this enterprise.',
      });
    }

    // This step reads the Government registry, so it is the one thing the app
    // genuinely cannot do offline. Saying so is better than queueing a request
    // whose answer the next screen needs.
    if (!online) {
      return setDialog({
        title: 'No connection',
        text:
          'Udyam validation checks your number against the Government registry, which needs a ' +
          'connection. Your entries are saved on this device — reopen the app once you are online.',
      });
    }

    setBusy(true);
    try {
      const draft = await verifyUdyam({
        udyamRegistrationNo: udyam.trim(),
        mobile,
        authorised: true,
      });

      await saveDraft({
        sessionToken: draft.sessionToken,
        step: 3,
        payload: { draft },
      });

      navigation.navigate('Enterprise');
    } catch (error) {
      setDialog({
        title: error instanceof OfflineError ? 'No connection' : 'Could not validate',
        text:
          error instanceof ApiError
            ? error.message
            : 'The registry could not be reached. Your entries are saved on this device.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card>
          <StepHead
            step={2}
            title="Udyam Verification"
            subtitle="Enter the Udyam Registration Number and the mobile number registered against it"
          />

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Validation is done through the Udyam API by matching your mobile number to Udyam
              records. No OTP is sent at this step.
            </Text>
          </View>

          <Field
            label="Udyam Registration Number"
            required
            value={udyam}
            onChangeText={(v) => setUdyam(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="UDYAM-MH-26-0014582"
            hint="Format: UDYAM-XX-00-XXXXXXX"
          />

          <Field
            label="Udyam-registered mobile number"
            required
            value={mobile}
            onChangeText={(v) => setMobile(digits(v, 10))}
            keyboardType="number-pad"
            placeholder="98765 43210"
            error={mobileError}
            hint="Must match the mobile recorded on the Udyam certificate"
          />

          <Pressable style={styles.check} onPress={() => setAuthorised((v) => !v)}>
            <View style={[styles.box, authorised ? styles.boxOn : null]}>
              {authorised ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.checkText}>
              I am authorised to register this enterprise for the LEAN Scheme.
            </Text>
          </Pressable>

          <PrimaryButton label="Validate with Udyam" onPress={validate} busy={busy} />
        </Card>
      </ScrollView>

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  page: { padding: space(4), paddingBottom: space(10) },

  notice: {
    backgroundColor: colour.blueTint,
    borderWidth: 1,
    borderColor: colour.blueLine,
    borderRadius: radius.sm,
    padding: space(3.5),
    marginBottom: space(5),
  },
  noticeText: { fontSize: type.tiny, color: colour.body, lineHeight: 18 },

  check: { flexDirection: 'row', gap: space(3), marginBottom: space(5), alignItems: 'flex-start' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colour.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colour.green, borderColor: colour.green },
  tick: { color: colour.surface, fontSize: type.small, fontWeight: '700' },
  checkText: { flex: 1, fontSize: type.small, color: colour.body, lineHeight: 20 },
});
