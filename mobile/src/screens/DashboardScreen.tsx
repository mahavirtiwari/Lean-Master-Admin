import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { dashboard, type MsmeDashboard } from '../api/registration';

import { Card, GhostButton, OfflineBanner } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

/** One accent per level, in the order the scheme lists them. */
const ACCENTS = [colour.bronze, colour.silver, colour.gold];

/**
 * Where an applicant lands after signing in.
 *
 * The dashboard is cached, so it opens with the last known state when there is
 * no signal rather than showing an empty screen. Applying for a level is a
 * server action and stays on the web portal until that flow exists on both.
 */
export default function DashboardScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, user, signOut } = useApp();

  const [data, setData] = useState<MsmeDashboard | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await dashboard();
      setData(result.data);
      setStale(result.stale);
    })();
  }, []);

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.hello}>Welcome</Text>
        <Text style={styles.name}>{user?.fullName ?? ''}</Text>

        <Card capped>
          <Text style={styles.label}>YOUR LEAN ID</Text>
          <Text style={styles.id}>{data?.enterprise.leanId ?? user?.userCode ?? '—'}</Text>
          <Text style={styles.hint}>Quote this in all correspondence about the scheme.</Text>

          {data ? (
            <>
              <Text style={styles.label}>ENTERPRISE</Text>
              <Text style={styles.value}>{data.enterprise.name}</Text>
              <Text style={styles.label}>UDYAM NUMBER</Text>
              <Text style={styles.value}>{data.enterprise.udyamNumber}</Text>
              <Text style={styles.label}>SELECTED UNIT</Text>
              <Text style={styles.value}>
                {[data.enterprise.unit?.unitName, data.enterprise.unit?.address]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </Text>
              <Text style={styles.label}>ACTIVITY</Text>
              <Text style={styles.value}>{data.enterprise.activity ?? '—'}</Text>
            </>
          ) : null}

          {stale && data ? (
            <Text style={styles.hint}>Showing the last copy saved on this device.</Text>
          ) : null}
        </Card>

        <Text style={styles.section}>Certification levels</Text>

        {(data?.levels ?? []).map((level, index) => (
          <View key={level.code} style={styles.level}>
            <View style={[styles.levelCap, { backgroundColor: ACCENTS[index] ?? colour.silver }]} />
            <View style={styles.levelBody}>
              <View style={styles.levelHead}>
                <Text style={styles.levelName}>{level.name}</Text>
                <Text style={[styles.levelState, level.state !== 'Locked' ? styles.levelOpen : null]}>
                  {level.state}
                </Text>
              </View>
              <Text style={styles.levelNote}>
                {level.requiresBefore
                  ? `Requires the ${level.requiresBefore} certificate first.`
                  : `${level.delivery} · ${level.cost}`}
              </Text>
            </View>
          </View>
        ))}

        {data && !data.incentives.unlocked ? (
          <Text style={styles.hint}>
            Incentives stay locked until an assessed level is certified.
          </Text>
        ) : null}

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
  levelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelName: { fontSize: type.body, fontWeight: '700', color: colour.text },
  levelState: { fontSize: type.tiny, fontWeight: '600', color: colour.muted },
  levelOpen: { color: colour.green },
  value: {
    fontSize: type.small,
    fontWeight: '600',
    color: colour.text,
    marginTop: space(1),
    marginBottom: space(2),
  },
  levelNote: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5) },
});
