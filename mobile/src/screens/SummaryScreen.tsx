import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RegistrationActivity, RegistrationDraft, RegistrationPlant } from '../api/registration';
import {
  AlertDialog,
  Card,
  GhostButton,
  OfflineBanner,
  PrimaryButton,
  StepHead,
} from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

/** R7. Built entirely from the local draft, so it opens with no connection. */
export default function SummaryScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft } = useApp();

  // The pledge PDF is generated from exactly what this screen shows, so the
  // applicant states that it is right rather than being advised to check it.
  const [confirmed, setConfirmed] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  const stored = draft.payload.draft as RegistrationDraft | undefined;
  const plant = draft.payload.chosenPlant as RegistrationPlant | undefined;
  const activity = draft.payload.chosenActivity as RegistrationActivity | undefined;
  const spoc = draft.payload.spoc as
    | { fullName: string; designation: string; mobile: string; email: string; attendedAwareness: boolean }
    | undefined;

  const e = stored?.enterprise;

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page}>
        <Card>
          <StepHead step={7} title="Summary" subtitle="Review your details before accepting the LEAN Pledge" />

          <Section title="Enterprise">
            <Row label="Enterprise name" value={e?.enterpriseName} />
            <Row label="Udyam number" value={e?.udyamNumber} />
            <Row label="Enterprise type" value={e?.enterpriseType} />
            <Row label="Entrepreneur" value={e?.ownerName} />
          </Section>

          <Section title="Selected Unit">
            <Row label="Unit" value={plant?.unitName} />
            <Row label="District / State" value={[plant?.district, plant?.state].filter(Boolean).join(', ')} />
            <Row label="Pincode" value={plant?.pincode} />
            <Row label="Address" value={plant?.address} />
          </Section>

          <Section title="Selected Activity">
            <Row label="Activity" value={activity?.nicFiveDigitName} />
            <Row label="Major activity" value={activity?.activity} />
            <Row label="NIC 2-digit" value={join(activity?.nicTwoDigit, activity?.nicTwoDigitName)} />
            <Row label="NIC 4-digit" value={join(activity?.nicFourDigit, activity?.nicFourDigitName)} />
            <Row label="NIC 5-digit" value={join(activity?.nicFiveDigit, activity?.nicFiveDigitName)} />
          </Section>

          <Section title="SPOC & Awareness">
            <Row label="SPOC name" value={spoc?.fullName} />
            <Row label="Designation" value={spoc?.designation} />
            <Row label="Mobile" value={spoc?.mobile} />
            <Row label="Awareness program" value={spoc?.attendedAwareness ? 'Attended' : 'Not attended'} />
          </Section>

          <View style={styles.mail}>
            <Text style={styles.mailLabel}>Provided Email ID</Text>
            <Text style={styles.mailValue}>{spoc?.email ?? '—'}</Text>
            <Text style={styles.mailNote}>
              Your LEAN ID, password and the LEAN Pledge PDF will be sent to this address.
            </Text>
          </View>

          <Pressable style={styles.confirm} onPress={() => setConfirmed((v) => !v)}>
            <View style={[styles.box, confirmed ? styles.boxOn : null]}>
              {confirmed ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.confirmText}>
              I confirm the above and agree to proceed with the information provided.
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.half} />
            <PrimaryButton
              label="Proceed to Pledge"
              onPress={() => {
                if (!confirmed) {
                  setDialog({
                    title: 'Please confirm',
                    text: 'Confirm that the details above are correct before proceeding to the pledge.',
                  });
                  return;
                }

                navigation.navigate('Pledge');
              }}
              style={styles.half}
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

const join = (code?: string | null, name?: string | null): string =>
  [code, name].filter(Boolean).join(' — ');

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string | null }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{label}</Text>
      <Text style={styles.value}>{value && value.length ? value : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  half: { flex: 1 },
  page: { padding: space(4), paddingBottom: space(10) },

  section: {
    backgroundColor: colour.surfaceQuiet,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(3),
  },
  sectionTitle: { fontSize: type.body, fontWeight: '700', color: colour.text, marginBottom: space(2) },

  // Stacked, not two columns: an address or a NIC name has nowhere to go
  // beside its label on a phone.
  row: { paddingVertical: space(2) },
  key: { fontSize: type.tiny, color: colour.muted },
  value: { fontSize: type.small, fontWeight: '600', color: colour.text, marginTop: space(1), lineHeight: 20 },

  mail: {
    backgroundColor: colour.greenTint,
    borderWidth: 1,
    borderColor: colour.greenLine,
    borderRadius: radius.md,
    padding: space(4),
    marginTop: space(2),
  },
  mailLabel: { fontSize: type.tiny, fontWeight: '700', color: colour.muted },
  mailValue: { fontSize: type.body, fontWeight: '700', color: colour.text, marginTop: space(1) },
  mailNote: { fontSize: type.tiny, color: colour.body, marginTop: space(1.5), lineHeight: 17 },

  confirm: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(3),
    marginTop: space(5),
    paddingTop: space(4),
    borderTopWidth: 1,
    borderTopColor: colour.line,
    marginBottom: space(4),
  },
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
  confirmText: { flex: 1, fontSize: type.small, color: colour.body, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: space(3) },
});
