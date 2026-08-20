import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RegistrationDraft } from '../api/registration';
import { Card, GhostButton, OfflineBanner, PrimaryButton, StepHead } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Enterprise'>;

/**
 * R3. Everything here is Udyam's record, read-only, and it came down with the
 * validation response — so this screen works offline on a resumed draft
 * without asking the registry again.
 */
export default function EnterpriseScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft, saveDraft } = useApp();

  const stored = draft.payload.draft as RegistrationDraft | undefined;
  const e = stored?.enterprise;

  const rows: { key: string; value: string }[] = [
    { key: 'Enterprise name', value: e?.enterpriseName ?? '—' },
    { key: 'Udyam number', value: e?.udyamNumber ?? '—' },
    { key: 'Enterprise type', value: e?.enterpriseType ?? '—' },
    { key: 'Entrepreneur', value: e?.ownerName ?? '—' },
    { key: 'Organisation type', value: e?.organisationType ?? '—' },
    { key: 'Major activity', value: e?.majorActivity ?? '—' },
    { key: 'State', value: e?.state ?? '—' },
    { key: 'District', value: e?.district ?? '—' },
    { key: 'Pincode', value: e?.pincode ?? '—' },
  ];

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page}>
        <Card>
          <StepHead
            step={3}
            title="Enterprise Details"
            subtitle="Validated from the MSME database, Ministry of MSME — these fields are read-only"
          />

          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <Text style={styles.key}>{row.key}</Text>
              <Text style={styles.value}>{row.value}</Text>
            </View>
          ))}

          {e?.address ? (
            <View style={styles.row}>
              <Text style={styles.key}>Address</Text>
              <Text style={styles.value}>{e.address}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.flex} />
            <PrimaryButton
              label="Continue"
              onPress={() => {
                void saveDraft({ step: 4 });
                navigation.navigate('UnitActivity');
              }}
              style={styles.flex}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  page: { padding: space(4), paddingBottom: space(10) },

  // Label above, value beneath: a Udyam address does not fit beside its label
  // on a phone at any sensible type size.
  row: {
    backgroundColor: colour.page,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.sm,
    padding: space(3),
    marginBottom: space(2.5),
  },
  key: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.3, color: colour.muted },
  value: { fontSize: type.small, fontWeight: '600', color: colour.text, marginTop: space(1), lineHeight: 20 },

  actions: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
});
