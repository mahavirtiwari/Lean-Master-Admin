import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dashboard, type MsmeDashboard } from '../api/registration';
import { AppShell } from '../components/AppShell';
import { Card } from '../components/ui';
import { IdentityHeader } from '../components/IdentityHeader';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/** The three ordered facts under "How certification works" (N01 / H00). */
const HOW_IT_WORKS = [
  'LEAN Bronze is free — five self-paced courses, each with an online exam at the end.',
  'LEAN Silver is paid — three handholding milestones at your plant, then an independent assessment.',
  'LEAN Gold needs a valid Silver certificate before you can apply for it.',
  'Incentives stay locked until Silver or Gold is certified. Bronze does not unlock them.',
  'Certificates are issued per plant, against the unit you registered.',
];

/**
 * The sections hub an applicant lands on after signing in (H00 / H02).
 *
 * Not a wall of stats: two doors — My Certifications and My Incentives — over
 * the enterprise identity, then a plain explanation of how the three levels
 * work. What the certification door says depends on whether anything has been
 * started yet.
 */
export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const [data, setData] = useState<MsmeDashboard | null>(null);

  useEffect(() => {
    void (async () => setData((await dashboard()).data))();
  }, []);

  const levels = data?.levels ?? [];
  const certified = levels.filter((l) => l.state === 'Certified').length;
  const started = levels.some((l) => l.state === 'In progress' || l.state === 'Certified');
  const groups = data?.incentives.groups.length ?? 0;

  const e = data?.enterprise;
  const address = [e?.unit?.address, e?.unit?.state, e?.unit?.pincode].filter(Boolean).join(', ');

  return (
    <AppShell title="Home">
      <Card capped>
        <IdentityHeader
          leanId={e?.leanId ?? '—'}
          name={e?.name ?? ''}
          unitName={e?.unit?.unitName}
          address={address || null}
        />
      </Card>

      <Text style={styles.heading}>Where do you want to go?</Text>

      {!started ? (
        <Text style={styles.lead}>Nothing recorded yet — start with a certification level.</Text>
      ) : null}

      <Pressable onPress={() => navigation.navigate('MyCertifications')}>
        <Card>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>My Certifications</Text>
              <Text style={styles.cardHint}>
                {started ? 'Bronze, Silver and Gold levels' : 'Choose a level to begin'}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{started ? `${certified} certified` : 'Not started'}</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <Pressable onPress={() => navigation.navigate('MyIncentives')}>
        <Card>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>My Incentives</Text>
              <Text style={styles.cardHint}>Benefits unlocked by certification</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{groups} groups</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <Text style={styles.heading}>How certification works</Text>
      <Card>
        <Text style={styles.explainLead}>Three levels, taken in order</Text>
        {HOW_IT_WORKS.map((line) => (
          <View key={line} style={styles.bulletRow}>
            <View style={styles.dot} />
            <Text style={styles.bullet}>{line}</Text>
          </View>
        ))}
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },

  heading: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colour.muted,
    textTransform: 'uppercase',
    marginTop: space(5),
    marginBottom: space(2),
  },
  lead: { fontSize: type.small, color: colour.body, marginBottom: space(3) },

  cardTitle: { fontSize: type.body, fontWeight: '700', color: colour.text },
  cardHint: { fontSize: type.tiny, color: colour.muted, marginTop: 2 },
  badge: {
    backgroundColor: colour.greenTint,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },
  badgeText: { fontSize: type.tiny, fontWeight: '700', color: colour.green },

  explainLead: { fontSize: type.small, fontWeight: '700', color: colour.text, marginBottom: space(2) },
  bulletRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colour.green, marginTop: 6 },
  bullet: { flex: 1, fontSize: type.small, color: colour.body, lineHeight: 20 },
});
