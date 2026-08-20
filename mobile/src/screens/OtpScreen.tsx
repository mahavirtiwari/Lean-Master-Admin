import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, ScrollView, Pressable } from 'react-native';

import { ApiError } from '../api/client';
import { sendOtp, verifyOtp } from '../api/registration';
import { AlertDialog, Card, GhostButton, OfflineBanner, PrimaryButton, StepHead } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

const LENGTH = 6;
const RESEND_AFTER_SECONDS = 30;

export default function OtpScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft, saveDraft } = useApp();

  const spoc = draft.payload.spoc as { email?: string } | undefined;
  const email = spoc?.email ?? 'your SPOC address';

  const [code, setCode] = useState<string[]>(Array<string>(LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_AFTER_SECONDS);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  const boxes = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const setDigit = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D+/g, '').slice(-1);

    setCode((was) => {
      const next = [...was];
      next[index] = digit;
      return next;
    });

    // Move on as each box is filled, back as each is cleared — typing a code
    // one box at a time is otherwise laborious on a phone.
    if (digit && index < LENGTH - 1) boxes.current[index + 1]?.focus();
    if (!digit && index > 0) boxes.current[index - 1]?.focus();
  }, []);

  async function resend(): Promise<void> {
    if (!online) {
      return setDialog({
        title: 'No connection',
        text: 'The code is sent by e-mail, so this needs a connection. Your details are saved on this device.',
      });
    }

    const token = draft.sessionToken;
    if (!token) return;

    try {
      await sendOtp(token);
      setCountdown(RESEND_AFTER_SECONDS);
      setDialog({
        title: 'Code sent',
        text: `A new code has been sent to ${email}. If it does not arrive, check your junk or spam folder.`,
      });
    } catch (error) {
      setDialog({
        title: 'Could not send',
        text: error instanceof ApiError ? error.message : 'The server could not be reached.',
      });
    }
  }

  async function verify(): Promise<void> {
    const otp = code.join('');

    if (otp.length !== LENGTH) {
      return setDialog({ title: 'Please check', text: `Enter all ${LENGTH} digits of the code.` });
    }

    if (!online) {
      return setDialog({
        title: 'No connection',
        text: 'Verifying the code needs a connection. Your details are saved on this device.',
      });
    }

    const token = draft.sessionToken;
    if (!token) return;

    setBusy(true);
    try {
      await verifyOtp(token, otp);
      await saveDraft({ step: 7 });
      navigation.navigate('Summary');
    } catch (error) {
      setCode(Array<string>(LENGTH).fill(''));
      boxes.current[0]?.focus();
      setDialog({
        title: 'Could not verify',
        text: error instanceof ApiError ? error.message : 'The server could not be reached.',
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
          <StepHead step={6} title="Verify your email address" subtitle={`We have sent a 6-digit OTP to ${email}`} />

          <Text style={styles.note}>
            OTP is successfully sent to {email}. If not received, please check your junk/spam folder.
          </Text>

          <View style={styles.boxes}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => {
                  boxes.current[index] = el;
                }}
                style={[styles.box, digit ? styles.boxFilled : null]}
                value={digit}
                onChangeText={(v) => setDigit(index, v)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                returnKeyType="next"
              />
            ))}
          </View>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn&apos;t receive it? </Text>
            <Pressable onPress={resend} disabled={countdown > 0}>
              <Text style={[styles.resendLink, countdown > 0 ? styles.resendOff : null]}>
                {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.flex} />
            <PrimaryButton label="Verify & Continue" onPress={verify} busy={busy} style={styles.flex} />
          </View>
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

  note: { fontSize: type.small, color: colour.body, lineHeight: 20, marginBottom: space(5) },

  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space(5) },
  box: {
    width: 46,
    height: 58,
    borderWidth: 1.5,
    borderColor: colour.input,
    borderRadius: radius.md,
    backgroundColor: colour.surface,
    fontSize: 24,
    fontWeight: '700',
    color: colour.text,
  },
  boxFilled: { borderColor: colour.blue },

  resendRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: space(5) },
  resendText: { fontSize: type.small, color: colour.muted },
  resendLink: { fontSize: type.small, fontWeight: '700', color: colour.blue },
  resendOff: { color: colour.input },

  actions: { flexDirection: 'row', gap: space(3) },
});
