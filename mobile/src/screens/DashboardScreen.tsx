import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, GhostButton, OfflineBanner } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const LEVELS = [
  { name: 'LEAN Bronze', note: 'Self-declared. No accredited assessment.', colour: colour.bronze },
  { name: 'LEAN Silver', note: 'Assessed. Unlocks incentives.', colour: colour.silver },
  { name: 'LEAN Gold', note: 'Assessed. Full incentive catalogue.', colour: colour.gold },
];

/**
 * Where an applicant lands after signing in.
 *
 * Reads only from the session, which is held on the device, so it opens with
 * no connection. Applying for a level is a server action and stays on the web
 * portal until that flow exists on both.
 */
export default function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, user, signOut } = useApp();

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.hello}>Welcome</Text>
        <Text style={styles.name}>{user?.fullName ?? ''}</Text>

        <Card capped>
          <Text style={styles.label}>YOUR LEAN ID</Text>
          <Text style={styles.id}>{user?.userCode ?? '—'}</Text>
          <Text style={styles.hint}>Quote this in all correspondence about the scheme.</Text>
        </Card>

        <Text style={styles.section}>Certification levels</Text>

        {LEVELS.map((level) => (
          <View key={level.name} style={styles.level}>
            <View style={[styles.levelCap, { backgroundColor: level.colour }]} />
            <View style={styles.levelBody}>
              <Text style={styles.levelName}>{level.name}</Text>
              <Text style={styles.levelNote}>{level.note}</Text>
            </View>
          </View>
        ))}

        <Card>
          <Text style={styles.hint}>
            Applying for a level and tracking an assessment are done on the web portal for now.
          </Text>
          <GhostButton
            label="Sign out"
            onPress={() => {
              void signOut();
              navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
            }}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  page: { padding: space(4), paddingBottom: space(10) },

  hello: { fontSize: type.small, color: colour.muted, marginTop: space(4) },
  name: { fontSize: type.hero, fontWeight: '700', color: colour.text, marginBottom: space(5) },

  label: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.5, color: colour.muted },
  id: { fontSize: type.title, fontWeight: '700', color: colour.text, marginTop: space(2) },
  hint: {
    fontSize: type.tiny,
    color: colour.muted,
    marginTop: space(2),
    lineHeight: 18,
    marginBottom: space(3),
  },

  section: { fontSize: type.section, fontWeight: '700', color: colour.text, marginBottom: space(3) },
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
  levelName: { fontSize: type.body, fontWeight: '700', color: colour.text },
  levelNote: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5) },
});
