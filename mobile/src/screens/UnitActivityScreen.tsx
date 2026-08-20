import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { queueUnit, saveUnit, type RegistrationDraft } from '../api/registration';
import {
  AlertDialog,
  Card,
  ChoiceCard,
  GhostButton,
  OfflineBanner,
  PrimaryButton,
  SectionBand,
  StepHead,
} from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UnitActivity'>;

export default function UnitActivityScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft, saveDraft, sync } = useApp();

  const stored = draft.payload.draft as RegistrationDraft | undefined;
  const plants = stored?.plants ?? [];
  const activities = stored?.activities ?? [];

  const [plantIndex, setPlantIndex] = useState<number | null>(null);
  const [activityIndex, setActivityIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  const plant = plantIndex === null ? null : plants[plantIndex];
  const activity = activityIndex === null ? null : activities[activityIndex];

  function choosePlant(index: number): void {
    const candidate = plants[index];

    if (candidate.isRegistered) {
      return setDialog({
        title: 'Plant already registered',
        text:
          `${candidate.unitName ?? 'That plant'} is already registered under ` +
          `${candidate.registeredLeanId}. Choose another plant, or sign in with that LEAN ID.`,
      });
    }

    setPlantIndex(index);
    // The activity belongs to the location, so changing the location clears it.
    setActivityIndex(null);
  }

  function chooseActivity(index: number): void {
    const candidate = activities[index];

    if (!candidate.isEligible) {
      return setDialog({
        title: 'Sector not eligible',
        text:
          `NIC ${candidate.nicTwoDigit} — ${candidate.nicTwoDigitName} is not currently covered ` +
          'by the LEAN Scheme. Choose an activity in a covered sector, or contact the helpline.',
      });
    }

    setActivityIndex(index);
  }

  async function next(): Promise<void> {
    if (!plant) return setDialog({ title: 'Please check', text: 'Select the plant location to be assessed.' });
    if (!activity) return setDialog({ title: 'Please check', text: 'Select the activity carried out there.' });

    const token = draft.sessionToken;
    if (!token) {
      return setDialog({ title: 'Start again', text: 'This draft has no session. Please start the registration again.' });
    }

    const body = {
      // The plant id, not the unit id: the registry repeats UnitIdNo across an
      // enterprise's units, so sending that alone resolves to whichever comes
      // first — which is how a free plant got refused as already registered.
      plantIdNo: plant.plantIdNo,
      unitIdNo: plant.unitIdNo ?? '',
      nicFiveDigit: activity.nicFiveDigit ?? '',
    };

    await saveDraft({ step: 5, payload: { chosenPlant: plant, chosenActivity: activity } });

    // This step only records a choice — nothing on the next screen depends on
    // the server's answer — so offline it goes to the outbox and the applicant
    // carries on.
    if (!online) {
      await queueUnit(token, body);
      navigation.navigate('Spoc');
      return;
    }

    setBusy(true);
    try {
      await saveUnit(token, body);
      navigation.navigate('Spoc');
    } catch (error) {
      if (error instanceof ApiError) {
        setDialog({ title: 'Please check', text: error.message });
      } else {
        await queueUnit(token, body);
        void sync();
        navigation.navigate('Spoc');
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
            step={4}
            title="Plant Location & Activity"
            subtitle="Select one plant location and the activity carried out there"
          />

          <SectionBand title="Please select any one plant location" />

          {plants.map((p) => (
            <ChoiceCard
              key={p.index}
              selected={plantIndex === p.index}
              blocked={p.isRegistered}
              onPress={() => choosePlant(p.index)}
              tag={
                p.isRegistered
                  ? { text: 'Registered', bad: true }
                  : plantIndex === p.index
                    ? { text: 'Selected' }
                    : undefined
              }
            >
              <Text style={styles.name}>{p.unitName ?? `Unit ${p.index + 1}`}</Text>
              <Text style={styles.addr}>
                {[p.address, p.district, p.state, p.pincode].filter(Boolean).join(', ')}
              </Text>
              {p.isRegistered ? (
                <Text style={styles.warn}>
                  Already registered under {p.registeredLeanId} — choose another plant.
                </Text>
              ) : null}
            </ChoiceCard>
          ))}

          {plant ? (
            <>
              <SectionBand
                title="Please select plant activity for the selected location"
                detail={`${plant.unitName ?? ''} — ${plant.address ?? ''}`}
              />

              {activities.map((a) => (
                <ChoiceCard
                  key={a.index}
                  selected={activityIndex === a.index}
                  blocked={!a.isEligible}
                  onPress={() => chooseActivity(a.index)}
                  tag={
                    !a.isEligible
                      ? { text: 'Not covered', bad: true }
                      : activityIndex === a.index
                        ? { text: 'Selected' }
                        : undefined
                  }
                >
                  <Text style={styles.name}>{a.nicFiveDigitName ?? a.activity}</Text>

                  {a.activity ? (
                    <View style={styles.major}>
                      <Text style={styles.majorText}>Major activity: {a.activity}</Text>
                    </View>
                  ) : null}

                  <View style={styles.nicBox}>
                    <Text style={styles.nicLabel}>NIC 2-DIGIT</Text>
                    <Text style={styles.nicValue}>
                      {a.nicTwoDigit} — {a.nicTwoDigitName}
                    </Text>
                  </View>
                  <View style={styles.nicBox}>
                    <Text style={styles.nicLabel}>NIC 4-DIGIT</Text>
                    <Text style={styles.nicValue}>
                      {a.nicFourDigit} — {a.nicFourDigitName}
                    </Text>
                  </View>
                  <View style={styles.nicBox}>
                    <Text style={styles.nicLabel}>NIC 5-DIGIT</Text>
                    <Text style={styles.nicValue}>
                      {a.nicFiveDigit} — {a.nicFiveDigitName}
                    </Text>
                  </View>
                </ChoiceCard>
              ))}
            </>
          ) : (
            <Text style={styles.pending}>
              Select a plant location above to see the activities recorded against it.
            </Text>
          )}

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.half} />
            <PrimaryButton label="Continue" onPress={next} busy={busy} style={styles.half} />
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
  half: { flex: 1 },
  page: { padding: space(4), paddingBottom: space(10) },

  name: { fontSize: type.small, fontWeight: '700', color: colour.text, lineHeight: 20 },
  addr: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5), lineHeight: 18 },
  warn: { fontSize: type.tiny, fontWeight: '600', color: colour.danger, marginTop: space(2) },

  major: {
    alignSelf: 'flex-start',
    backgroundColor: colour.blueTint,
    borderWidth: 1,
    borderColor: colour.blueLine,
    borderRadius: radius.sm,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    marginTop: space(2),
  },
  majorText: { fontSize: type.tiny, fontWeight: '600', color: colour.blue },

  nicBox: {
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.sm,
    padding: space(2.5),
    marginTop: space(2),
  },
  nicLabel: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.3, color: colour.muted },
  nicValue: { fontSize: type.tiny, fontWeight: '600', color: colour.text, marginTop: space(1), lineHeight: 17 },

  pending: { fontSize: type.tiny, color: colour.muted, marginVertical: space(4) },
  actions: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
});
