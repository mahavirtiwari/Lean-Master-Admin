import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dashboard, type MsmeDashboard } from '../api/registration';
import { AppShell } from '../components/AppShell';
import { AlertDialog, Card, GhostButton, PrimaryButton } from '../components/ui';
import { colour, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyIncentives'>;

/** The blurb the artboard shows under each of the five benefit groups. */
const BLURB: Record<string, string> = {
  'Technology Upgradation': 'Govt schemes for manufacturing technology & equipment upgrade',
  'Testing & Product Certification':
    'Assistance for product testing, quality certification and lab charges',
  'State Specific Benefits': 'State government incentives, subsidies and applicable schemes',
  'Financial Institution Benefits': 'Preferential loans, collateral-free credit and priority lending',
  Others: 'Market linkages, export assistance, cluster development and more',
};

/**
 * The five benefit groups (I01). Each unlocks on certification; until then the
 * Avail action is disabled with the reason, and View Details still explains
 * what the group covers.
 */
export default function MyIncentivesScreen(_: Props): React.JSX.Element {
  const [data, setData] = useState<MsmeDashboard | null>(null);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    void (async () => setData((await dashboard()).data))();
  }, []);

  const unlocked = data?.incentives.unlocked ?? false;
  const groups = data?.incentives.groups ?? [];

  return (
    <AppShell title="My Incentives" canGoBack>
      {!unlocked ? (
        <Text style={styles.lead}>
          Incentives unlock when a LEAN Silver or Gold certificate is issued. Until then you can
          see what each group covers.
        </Text>
      ) : null}

      {groups.map((group) => (
        <Card key={group.name} style={styles.card}>
          <Text style={styles.name}>{group.name}</Text>
          <Text style={styles.blurb}>{BLURB[group.name] ?? `${group.count} schemes`}</Text>
          <View style={styles.actions}>
            <GhostButton
              label="View Details"
              onPress={() => setDialog({ title: group.name, text: BLURB[group.name] ?? '' })}
              style={styles.flex}
            />
            <PrimaryButton
              label="Avail"
              disabled={!unlocked}
              onPress={() => setDialog({ title: group.name, text: 'Choose a scheme to begin your application.' })}
              style={styles.flex}
            />
          </View>
          {!unlocked ? <Text style={styles.locked}>Locked until certification</Text> : null}
        </Card>
      ))}

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
  flex: { flex: 1 },
  lead: { fontSize: type.small, color: colour.body, marginBottom: space(3), lineHeight: 20 },
  card: { marginBottom: space(3) },
  name: { fontSize: type.body, fontWeight: '700', color: colour.text },
  blurb: { fontSize: type.small, color: colour.body, marginTop: space(1.5), lineHeight: 20 },
  actions: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  locked: { fontSize: type.tiny, color: colour.muted, marginTop: space(2), textAlign: 'center' },
});
