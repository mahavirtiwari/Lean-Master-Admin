import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colour, radius, space, type } from '../theme/theme';

/** First letters of the first two words — "Sharma Auto" -> "SA". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The enterprise identity block that opens the home screen and the side pane:
 * avatar, LEAN ID, name and the registered unit. Drawn from the applicant's own
 * dashboard, so it reads the same wherever it appears.
 */
export function IdentityHeader({
  leanId,
  name,
  unitName,
  address,
  compact,
}: {
  leanId: string;
  name: string;
  unitName?: string | null;
  address?: string | null;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.row, compact ? styles.compact : null]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initialsOf(name)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.hello}>Welcome</Text>
        <Text style={styles.lean}>{leanId}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {unitName ? (
          <Text style={styles.unit} numberOfLines={1}>
            {unitName}
          </Text>
        ) : null}
        {address && !compact ? (
          <Text style={styles.addr} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  compact: { alignItems: 'center' },
  flex: { flex: 1 },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colour.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: type.body, fontWeight: '800', color: colour.surface },

  hello: { fontSize: type.tiny, color: colour.muted },
  lean: { fontSize: type.small, fontWeight: '800', color: colour.green, marginTop: 1 },
  name: { fontSize: type.body, fontWeight: '700', color: colour.text, marginTop: 1 },
  unit: { fontSize: type.small, color: colour.body, marginTop: 2 },
  addr: { fontSize: type.tiny, color: colour.muted, marginTop: 2, lineHeight: 16 },
});
