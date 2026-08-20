import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { complete, type RegistrationDraft } from '../api/registration';
import { enqueue } from '../offline/db';
import { AlertDialog, Card, GhostButton, OfflineBanner, PrimaryButton, StepHead } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Pledge'>;

const PLEDGE = [
  'We commit to adopting LEAN manufacturing practices across the registered unit.',
  'We will nominate a single point of contact and make them available to the assigned consultant.',
  'We will make the shop floor, records and staff available for handholding and assessment.',
  'We will implement the agreed corrective actions within the timelines recorded.',
  'We confirm that the information provided in this registration is true to the best of our knowledge.',
];

export default function PledgeScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft, saveDraft, resetDraft, sync } = useApp();

  const stored = draft.payload.draft as RegistrationDraft | undefined;

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  async function submit(): Promise<void> {
    if (!accepted) {
      return setDialog({ title: 'Please check', text: 'Accept the LEAN Pledge to complete your registration.' });
    }

    const token = draft.sessionToken;
    if (!token) {
      return setDialog({ title: 'Start again', text: 'This draft has no session. Please start the registration again.' });
    }

    const body = { acceptPledge: true };

    // Offline the submission is queued rather than refused. The LEAN ID is
    // issued by the server, so it cannot be shown yet — the completion screen
    // says the registration is pending instead of inventing one.
    if (!online) {
      await enqueue('POST', `/api/registration/${token}/complete`, body);
      await saveDraft({ step: 9 });

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Complete',
            params: {
              leanId: '',
              enterpriseName: stored?.enterprise?.enterpriseName ?? '',
              spocEmail: '',
              queued: true,
            },
          },
        ],
      });
      return;
    }

    setBusy(true);
    try {
      const result = await complete(token, body);
      await resetDraft();

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Complete',
            params: {
              leanId: result.leanId,
              enterpriseName: result.enterpriseName,
              spocEmail: result.spocEmail,
            },
          },
        ],
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setDialog({ title: 'Could not complete', text: error.message });
      } else {
        await enqueue('POST', `/api/registration/${token}/complete`, body);
        void sync();
        setDialog({
          title: 'Saved on this device',
          text:
            'The server could not be reached. Your registration is saved and will be submitted ' +
            'automatically when you reconnect.',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page}>
        <Card>
          <StepHead
            step={8}
            title="LEAN Pledge"
            subtitle="Read the pledge and accept it to complete your registration"
          />

          <View style={styles.pledge}>
            <Text style={styles.pledgeHead}>LEAN PLEDGE</Text>
            <Text style={styles.pledgeFor}>
              {stored?.enterprise?.enterpriseName ?? ''} · {stored?.enterprise?.udyamNumber ?? ''}
            </Text>

            {PLEDGE.map((line, index) => (
              <View key={line} style={styles.pledgeRow}>
                <Text style={styles.pledgeNo}>{index + 1}.</Text>
                <Text style={styles.pledgeText}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.check} onPress={() => setAccepted((v) => !v)}>
            <View style={[styles.box, accepted ? styles.boxOn : null]}>
              {accepted ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.checkText}>
              On behalf of the enterprise, I accept the LEAN Pledge and confirm the details provided.
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.flex} />
            <PrimaryButton
              label="Accept & Complete"
              onPress={submit}
              busy={busy}
              style={styles.flex}
            />
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

  pledge: {
    backgroundColor: colour.surfaceQuiet,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(5),
  },
  pledgeHead: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.6, color: colour.muted },
  pledgeFor: { fontSize: type.small, fontWeight: '700', color: colour.text, marginTop: space(1), marginBottom: space(3) },
  pledgeRow: { flexDirection: 'row', gap: space(2), marginTop: space(2.5) },
  pledgeNo: { fontSize: type.small, fontWeight: '700', color: colour.green },
  pledgeText: { flex: 1, fontSize: type.small, color: colour.body, lineHeight: 21 },

  check: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start', marginBottom: space(5) },
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

  actions: { flexDirection: 'row', gap: space(3) },
});
