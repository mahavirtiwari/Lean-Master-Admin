import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dashboard, type MsmeDashboard } from '../api/registration';
import { AppShell } from '../components/AppShell';
import { AlertDialog, Card, PrimaryButton } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyCertifications'>;

const ACCENT: Record<string, string> = { BRONZE: colour.bronze, SILVER: colour.silver, GOLD: colour.gold };

const BLURB: Record<string, string> = {
  BRONZE: 'Five self-paced courses with an online exam after each.',
  SILVER:
    'Three-milestone handholding by QCI or NPC, then an independent assessment. Unlocks all incentives.',
  GOLD: 'Advanced LEAN systems across three milestones. Opens once your LEAN Silver certificate is issued.',
};

/**
 * The three certification levels (C01). Each card carries the level's accent, a
 * short description and a state — Apply when it is open, the reason when it is
 * not. The subsidy note sits at the foot, as the artboard draws it.
 */
export default function MyCertificationsScreen({ navigation }: Props): React.JSX.Element {
  const [data, setData] = useState<MsmeDashboard | null>(null);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    void (async () => setData((await dashboard()).data))();
  }, []);

  function apply(levelName: string, code: string): void {
    if (code === 'SILVER') {
      navigation.navigate('SilverApplication');
      return;
    }
    setDialog({
      title: `${levelName} application`,
      text:
        code === 'BRONZE'
          ? 'The Bronze courses and their exams open here in the next update.'
          : 'Gold opens once your Silver certificate is issued.',
    });
  }

  const levels = data?.levels ?? [];

  return (
    <AppShell title="Certification Levels" canGoBack>
      {levels.map((level) => {
        const open = level.state === 'Open' || level.state === 'In progress';
        return (
          <Card key={level.code} style={{ ...styles.level, borderLeftColor: ACCENT[level.code] ?? colour.silver }}>
            <View style={styles.levelHead}>
              <Text style={styles.levelName}>{level.name}</Text>
              <View style={[styles.state, open ? styles.stateOpen : null]}>
                <Text style={[styles.stateText, open ? styles.stateOpenText : null]}>{level.state}</Text>
              </View>
            </View>

            <Text style={styles.blurb}>{BLURB[level.code] ?? `${level.delivery} · ${level.cost}`}</Text>

            {level.cost ? <Text style={styles.cost}>{level.cost}</Text> : null}

            {level.state === 'Locked' ? (
              <Text style={styles.locked}>
                {level.requiresBefore
                  ? `Requires the ${level.requiresBefore} certificate first.`
                  : 'Not available yet.'}
              </Text>
            ) : level.state === 'Certified' ? (
              <Text style={styles.certified}>Certified — download your certificate from Documents.</Text>
            ) : (
              <PrimaryButton label="Apply" onPress={() => apply(level.name, level.code)} style={styles.apply} />
            )}
          </Card>
        );
      })}

      <Text style={styles.note}>
        Fees are payable online and attract 18% GST. A government subsidy covers 90% of the
        certification fee, with an additional 5% for SC/ST, women-led and NER enterprises.
      </Text>

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  level: { borderLeftWidth: 4, marginBottom: space(3) },
  levelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelName: { fontSize: type.body, fontWeight: '800', color: colour.text },
  state: {
    backgroundColor: colour.surfaceQuiet,
    borderRadius: radius.pill,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  stateOpen: { backgroundColor: colour.greenTint },
  stateText: { fontSize: type.tiny, fontWeight: '700', color: colour.muted },
  stateOpenText: { color: colour.green },

  blurb: { fontSize: type.small, color: colour.body, marginTop: space(2), lineHeight: 20 },
  cost: { fontSize: type.small, fontWeight: '700', color: colour.text, marginTop: space(2) },
  locked: { fontSize: type.tiny, color: colour.muted, marginTop: space(3) },
  certified: { fontSize: type.tiny, color: colour.green, fontWeight: '600', marginTop: space(3) },
  apply: { marginTop: space(3) },

  note: { fontSize: type.tiny, color: colour.muted, marginTop: space(2), lineHeight: 18 },
});
