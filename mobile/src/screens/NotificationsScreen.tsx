import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { notifications, type AppNotification } from '../api/account';
import { AppShell } from '../components/AppShell';
import { Card } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const ACCENT: Record<string, string> = {
  payment: colour.green,
  application: colour.blue,
  certificate: colour.gold,
};

/** "2h ago", "1d ago" from a timestamp. */
function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * The applicant's recent activity as notifications (H03), newest first. Derived
 * from their own records — payment, application, certificates — until a
 * dedicated notifications feed exists.
 */
export default function NotificationsScreen(_: Props): React.JSX.Element {
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    void (async () => setItems(await notifications().catch(() => [])))();
  }, []);

  return (
    <AppShell title="Notifications" canGoBack>
      {items && items.length === 0 ? (
        <Card capped>
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptyText}>Updates about your application and certification appear here.</Text>
        </Card>
      ) : null}

      {(items ?? []).map((n, i) => (
        <Card key={i} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: ACCENT[n.kind] ?? colour.muted }]} />
          <View style={styles.flex}>
            <Text style={styles.title}>{n.title}</Text>
            <Text style={styles.detail}>{n.detail}</Text>
          </View>
          <Text style={styles.time}>{ago(n.onUtc)}</Text>
        </Card>
      ))}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), marginBottom: space(2) },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  title: { fontSize: type.small, fontWeight: '700', color: colour.text },
  detail: { fontSize: type.tiny, color: colour.muted, marginTop: 2, lineHeight: 16 },
  time: { fontSize: type.tiny, color: colour.placeholder },

  emptyTitle: { fontSize: type.section, fontWeight: '700', color: colour.text },
  emptyText: { fontSize: type.small, color: colour.body, marginTop: space(1), lineHeight: 20 },
});
