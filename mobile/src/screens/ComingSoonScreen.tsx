import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { AppShell } from '../components/AppShell';
import { Card } from '../components/ui';
import { colour, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

/** What each pending section is called and promises, until its screen lands. */
const COPY: Partial<Record<keyof RootStackParamList, { title: string; text: string }>> = {
  Payments: { title: 'Payments', text: 'Your fees, payment methods and receipts appear here.' },
  Documents: { title: 'Documents', text: 'Your certificates, application files and invoices appear here.' },
  Profile: { title: 'Profile', text: 'Your enterprise and SPOC details, with Udyam re-validation.' },
  Notifications: { title: 'Notifications', text: 'Scheme updates and reminders appear here.' },
  SilverApplication: {
    title: 'LEAN Silver Application',
    text: 'The Silver application — basic information, ESG, documents and review — opens here.',
  },
};

/**
 * A placeholder for the sections not yet built, so every navigation link is
 * live rather than dead while the app is completed screen group by screen group.
 */
export default function ComingSoonScreen({ route }: NativeStackScreenProps<RootStackParamList>): React.JSX.Element {
  const copy = COPY[route.name as keyof RootStackParamList] ?? {
    title: String(route.name),
    text: 'This section is on the way.',
  };

  return (
    <AppShell title={copy.title} canGoBack>
      <Card capped>
        <Text style={styles.title}>Coming in the next update</Text>
        <Text style={styles.text}>{copy.text}</Text>
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: type.section, fontWeight: '700', color: colour.text },
  text: { fontSize: type.small, color: colour.body, marginTop: space(2), lineHeight: 20 },
});
