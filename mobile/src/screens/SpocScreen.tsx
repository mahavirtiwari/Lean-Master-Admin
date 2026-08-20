import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { awarenessPrograms, queueSpoc, saveSpoc, type AwarenessProgram } from '../api/registration';
import {
  AlertDialog,
  Card,
  Field,
  GhostButton,
  OfflineBanner,
  PrimaryButton,
  StepHead,
} from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Spoc'>;

const digits = (value: string, max: number): string => value.replace(/\D+/g, '').slice(0, max);

export default function SpocScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft, saveDraft, sync } = useApp();

  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [attended, setAttended] = useState<boolean | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [programs, setPrograms] = useState<AwarenessProgram[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await awarenessPrograms();
      setPrograms(data ?? []);
    })();
  }, []);

  const mobileError =
    mobile.length === 0
      ? null
      : mobile.length < 10
        ? 'Enter all 10 digits.'
        : /^[6-9]\d{9}$/.test(mobile)
          ? null
          : 'A mobile number starts with 6, 7, 8 or 9.';

  const emailError =
    email.trim().length === 0
      ? null
      : /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())
        ? null
        : 'Enter a valid e-mail address.';

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return programs;

    return programs.filter((p) =>
      [p.programCode, p.venue, p.name, p.heldOn].some((f) => (f ?? '').toLowerCase().includes(q)),
    );
  }, [programs, search]);

  async function next(): Promise<void> {
    if (!name.trim() || !designation.trim()) {
      return setDialog({ title: 'Please check', text: 'The SPOC name and designation are both required.' });
    }
    if (mobileError || mobile.length !== 10) {
      return setDialog({ title: 'Please check', text: mobileError ?? 'Enter the SPOC mobile number.' });
    }
    if (emailError || !email.trim()) {
      return setDialog({ title: 'Please check', text: emailError ?? 'Enter the SPOC e-mail address.' });
    }
    if (attended === null) {
      return setDialog({ title: 'Please check', text: 'Tell us whether an awareness programme was attended.' });
    }
    if (attended && programId === null) {
      return setDialog({ title: 'Please check', text: 'Select which awareness programme was attended.' });
    }

    const token = draft.sessionToken;
    if (!token) {
      return setDialog({ title: 'Start again', text: 'This draft has no session. Please start the registration again.' });
    }

    const body = {
      fullName: name.trim(),
      designation: designation.trim(),
      mobile,
      email: email.trim(),
      attendedAwareness: attended,
      awarenessProgramId: attended ? programId : null,
    };

    await saveDraft({ step: 6, payload: { spoc: body } });

    // Offline the details are queued and the applicant is told plainly that the
    // OTP waits for a connection — it is an e-mail, and no local state can
    // stand in for one.
    if (!online) {
      await queueSpoc(token, body);
      return setDialog({
        title: 'Saved on this device',
        text:
          'Your SPOC details are saved and will be sent when you reconnect. The verification code ' +
          'is e-mailed, so that step needs a connection — reopen the app once you are online.',
      });
    }

    setBusy(true);
    try {
      await saveSpoc(token, body);
      navigation.navigate('Otp');
    } catch (error) {
      if (error instanceof ApiError) {
        setDialog({ title: 'Please check', text: error.message });
      } else {
        await queueSpoc(token, body);
        void sync();
        setDialog({
          title: 'Saved on this device',
          text: 'The server could not be reached. Your details are saved and will be sent when you reconnect.',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card>
          <StepHead
            step={5}
            title="SPOC Contact Details & Awareness Program"
            subtitle="The single point of contact receives the OTP, LEAN ID and system password"
          />

          <Field label="Full name" required value={name} onChangeText={setName} placeholder="e.g. Rakesh Sharma" />
          <Field
            label="Designation"
            required
            value={designation}
            onChangeText={setDesignation}
            placeholder="e.g. Plant Head"
          />
          <Field
            label="Mobile number"
            required
            value={mobile}
            onChangeText={(v) => setMobile(digits(v, 10))}
            keyboardType="number-pad"
            placeholder="98765 43210"
            error={mobileError}
          />
          <Field
            label="Email address"
            required
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="spoc@enterprise.in"
            error={emailError}
            hint="OTP will be sent to this address for verification"
          />

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Awareness Program Participation</Text>
            <Text style={styles.panelSub}>Have you participated in any LEAN Awareness Program?</Text>

            <View style={styles.yesno}>
              {[true, false].map((value) => (
                <Pressable
                  key={String(value)}
                  style={styles.radioRow}
                  onPress={() => {
                    setAttended(value);
                    if (!value) setProgramId(null);
                  }}
                >
                  <View style={[styles.radio, attended === value ? styles.radioOn : null]}>
                    {attended === value ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={styles.radioLabel}>{value ? 'Yes' : 'No'}</Text>
                </Pressable>
              ))}
            </View>

            {attended === true ? (
              <View style={styles.picker}>
                <Text style={styles.pickerLabel}>SELECT PROGRAM</Text>

                <Field
                  label="Search"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by programme ID or venue"
                  autoCorrect={false}
                />

                {matches.length === 0 ? (
                  <Text style={styles.empty}>No programme matches that search.</Text>
                ) : (
                  matches.map((p) => (
                    <Pressable
                      key={p.awarenessProgramId}
                      style={[styles.option, programId === p.awarenessProgramId ? styles.optionOn : null]}
                      onPress={() => setProgramId(p.awarenessProgramId)}
                    >
                      <Text style={styles.optionCode}>
                        {p.programCode ?? `AP-${p.awarenessProgramId}`}
                      </Text>
                      <Text style={styles.optionVenue}>{p.venue ?? '—'}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.half} />
            <PrimaryButton label="Send OTP to Email" onPress={next} busy={busy} style={styles.half} />
          </View>
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
  half: { flex: 1 },
  page: { padding: space(4), paddingBottom: space(10) },

  panel: {
    backgroundColor: colour.greenTint,
    borderWidth: 1,
    borderColor: colour.greenLine,
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(5),
  },
  panelTitle: { fontSize: type.body, fontWeight: '700', color: colour.text },
  panelSub: { fontSize: type.small, color: colour.muted, marginTop: space(2), lineHeight: 19 },

  yesno: { flexDirection: 'row', gap: space(8), marginTop: space(4) },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colour.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colour.blue },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colour.blue },
  radioLabel: { fontSize: type.body, fontWeight: '600', color: colour.text },

  picker: { marginTop: space(4) },
  pickerLabel: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colour.muted,
    marginBottom: space(2),
  },
  option: {
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.sm,
    padding: space(3),
    marginBottom: space(2),
  },
  optionOn: { borderColor: colour.blue, backgroundColor: colour.blueTint },
  optionCode: { fontSize: type.small, fontWeight: '700', color: colour.text },
  optionVenue: { fontSize: type.tiny, color: colour.muted, marginTop: space(1) },
  empty: { fontSize: type.tiny, color: colour.muted, paddingVertical: space(3) },

  actions: { flexDirection: 'row', gap: space(3) },
});
