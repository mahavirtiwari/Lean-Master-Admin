import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '../config';
import { applicantDocuments, type ApplicantDocument } from '../api/registration';
import { Card, GhostButton, PrimaryButton } from '../components/ui';
import { RegShell } from '../components/RegShell';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterLanding'>;

const NEEDED = [
  { name: 'Udyam Registration Number', hint: 'Format UDYAM-XX-00-XXXXXXX' },
  { name: 'Udyam-registered mobile number', hint: 'Validated against Udyam records' },
  { name: 'SPOC email address', hint: 'Receives the OTP, LEAN ID and password' },
  { name: 'Plant / unit address & NIC code', hint: '2-digit, 4-digit and 5-digit classification' },
];

const LEVELS = [
  { name: 'LEAN Bronze', note: 'Entry level — foundation LEAN tools', colour: colour.bronze },
  { name: 'LEAN Silver', note: 'Intermediate — unlocks incentives', colour: colour.silver },
  { name: 'LEAN Gold', note: 'Advanced — full incentive catalogue', colour: colour.gold },
];

export default function RegisterLandingScreen({ navigation }: Props): React.JSX.Element {
  const { draft } = useApp();
  const [guides, setGuides] = useState<ApplicantDocument[]>([]);

  useEffect(() => {
    void (async () => {
      // Cached, so the guide is listed with no signal; an empty list simply
      // renders nothing rather than an error.
      const { data } = await applicantDocuments();
      setGuides(data ?? []);
    })();
  }, []);

  const resuming = draft.sessionToken !== null && draft.step > 1;

  return (
    <RegShell title="New Registration" step={1}>
        <Text style={styles.hero}>Register for the LEAN Scheme</Text>
        <Text style={styles.heroSub}>
          One registration covers all three certification levels. Apply for a level later from your
          dashboard.
        </Text>
        <View style={styles.rule} />

        <Card capped>
          <Text style={styles.cardTitle}>New Registration</Text>
          <Text style={styles.cardLine}>
            Start a fresh application using your Udyam Registration Number.
          </Text>

          <PrimaryButton
            label={resuming ? 'Resume your registration' : 'Start New Registration'}
            onPress={() => navigation.navigate(resuming ? 'UnitActivity' : 'Udyam')}
            style={styles.cta}
          />

          {/* The draft notice stays: it says something about this device that
              the applicant cannot see anywhere else. */}
          {resuming ? (
            <Text style={styles.resume}>
              A saved draft from this device will be continued. Nothing has been submitted yet.
            </Text>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>What you&apos;ll need</Text>

          {NEEDED.map((item) => (
            <View key={item.name} style={styles.need}>
              <View style={styles.needDot} />
              <View style={styles.flex}>
                <Text style={styles.needName}>{item.name}</Text>
                <Text style={styles.needHint}>{item.hint}</Text>
              </View>
            </View>
          ))}

          {guides.length > 0 ? (
            <View style={styles.guides}>
              {guides.map((guide) => (
                <Pressable
                  key={guide.documentId}
                  onPress={() => void Linking.openURL(`${API_BASE_URL}${guide.url}`)}
                >
                  <Text style={styles.guide}>
                    {guide.kind === 'video' ? '▶  ' : '▤  '}
                    {guide.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.alreadyLabel}>ALREADY REGISTERED?</Text>
          <Text style={styles.cardLine}>
            Sign in with your LEAN ID to apply for a certification level or track your application.
          </Text>
          <GhostButton label="Sign in" onPress={() => navigation.navigate('SignIn')} />
        </Card>

        {LEVELS.map((level) => (
          <View key={level.name} style={styles.level}>
            <View style={[styles.levelCap, { backgroundColor: level.colour }]} />
            <View style={styles.levelBody}>
              <View style={styles.levelHead}>
                <View style={[styles.levelDot, { backgroundColor: level.colour }]} />
                <Text style={styles.levelName}>{level.name}</Text>
              </View>
              <Text style={styles.levelNote}>{level.note}</Text>
            </View>
          </View>
        ))}
    </RegShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  hero: { fontSize: type.hero, fontWeight: '700', color: colour.text, lineHeight: 32 },
  heroSub: { fontSize: type.small, color: colour.muted, marginTop: space(2), lineHeight: 20 },
  rule: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: colour.green,
    marginTop: space(4),
    marginBottom: space(5),
  },

  cardTitle: { fontSize: type.title, fontWeight: '700', color: colour.text, marginBottom: space(2) },
  cardLine: { fontSize: type.small, color: colour.muted, lineHeight: 21, marginBottom: space(2) },
  cta: { marginTop: space(3) },
  resume: { fontSize: type.tiny, color: colour.blue, fontWeight: '600', marginTop: space(4), lineHeight: 17 },

  sectionTitle: { fontSize: type.section, fontWeight: '700', color: colour.text, marginBottom: space(3) },
  need: { flexDirection: 'row', gap: space(3), paddingVertical: space(2.5) },
  needDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colour.blueTint,
    borderWidth: 2,
    borderColor: colour.blue,
    marginTop: space(1),
  },
  needName: { fontSize: type.small, fontWeight: '700', color: colour.text },
  needHint: { fontSize: type.tiny, color: colour.muted, marginTop: space(0.5) },

  guides: { marginTop: space(4), paddingTop: space(4), borderTopWidth: 1, borderTopColor: colour.line },
  guide: { fontSize: type.small, fontWeight: '600', color: colour.blue, paddingVertical: space(2) },

  alreadyLabel: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colour.muted,
    marginBottom: space(2),
  },

  level: {
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space(3),
  },
  levelCap: { height: 3 },
  levelBody: { padding: space(4) },
  levelHead: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  levelDot: { width: 10, height: 10, borderRadius: 2 },
  levelName: { fontSize: type.body, fontWeight: '700', color: colour.text },
  levelNote: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5) },
});
