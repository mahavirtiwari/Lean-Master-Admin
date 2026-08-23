import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '../components/AppShell';
import { Card, GhostButton, PrimaryButton } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationSubmitted'>;

/** The stages that follow submission (C08). */
const NEXT = [
  { title: 'Payment', note: 'Pay the Silver fee to start handholding' },
  { title: 'Under review', note: 'The implementing agency verifies your documents' },
  { title: 'Consultant assigned', note: 'Your handholding schedule is shared' },
  { title: 'Milestone 1 begins', note: 'Baseline visit at your unit' },
];

/**
 * The confirmation after a Silver application is submitted (C08). Payment and
 * everything past it are done on the app; the screen sets the expectation and
 * offers the two onward actions.
 */
export default function ApplicationSubmittedScreen({ navigation }: Props): React.JSX.Element {
  return (
    <AppShell title="Application submitted" canGoBack>
      <Card capped>
        <View style={styles.tickWrap}>
          <View style={styles.tick}>
            <Text style={styles.tickMark}>✓</Text>
          </View>
        </View>
        <Text style={styles.done}>Application submitted</Text>
        <Text style={styles.sub}>Your LEAN Silver application has been received.</Text>
      </Card>

      <Text style={styles.heading}>What happens next</Text>
      <Card>
        {NEXT.map((stage, i) => (
          <View key={stage.title} style={styles.stageRow}>
            <View style={styles.stageNo}>
              <Text style={styles.stageNoText}>{i + 1}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.stageTitle}>{stage.title}</Text>
              <Text style={styles.stageNote}>{stage.note}</Text>
            </View>
          </View>
        ))}
      </Card>

      <PrimaryButton label="Go to payment" onPress={() => navigation.navigate('Payments')} style={styles.action} />
      <GhostButton label="Back to home" onPress={() => navigation.navigate('Home')} style={styles.action} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tickWrap: { alignItems: 'center', marginBottom: space(2) },
  tick: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colour.greenTint,
    borderWidth: 1,
    borderColor: colour.greenLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { fontSize: 28, color: colour.green, fontWeight: '800' },
  done: { fontSize: type.title, fontWeight: '800', color: colour.text, textAlign: 'center' },
  sub: { fontSize: type.small, color: colour.body, textAlign: 'center', marginTop: space(1) },

  heading: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colour.muted,
    textTransform: 'uppercase',
    marginTop: space(5),
    marginBottom: space(2),
  },
  stageRow: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start', marginTop: space(3) },
  stageNo: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colour.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageNoText: { fontSize: type.tiny, fontWeight: '800', color: colour.surface },
  stageTitle: { fontSize: type.small, fontWeight: '700', color: colour.text },
  stageNote: { fontSize: type.tiny, color: colour.muted, marginTop: 1 },

  action: { marginTop: space(3) },
});
