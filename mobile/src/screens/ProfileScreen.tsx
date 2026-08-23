import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { profile, type Profile } from '../api/account';
import { AppShell } from '../components/AppShell';
import { Card } from '../components/ui';
import { colour, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

/**
 * The applicant's profile (P01). The enterprise details are what Udyam holds
 * and are read-only — a change goes through re-validation with Udyam, not a
 * text field here. The SPOC contact is shown below.
 */
export default function ProfileScreen(_: Props): React.JSX.Element {
  const [data, setData] = useState<Profile | null>(null);

  useEffect(() => {
    void (async () => setData(await profile().catch(() => null)))();
  }, []);

  const e = data?.enterprise;
  const s = data?.spoc;

  return (
    <AppShell title="Profile" canGoBack>
      <Card capped>
        <Text style={styles.section}>Enterprise Details</Text>
        <Text style={styles.readonly}>
          Validated from the MSME database, Ministry of MSME — these fields are read-only.
        </Text>
        <Row label="Enterprise name" value={e?.name} />
        <Row label="Udyam registration number" value={e?.udyamRegistrationNo} />
        <Row label="Name of entrepreneur" value={e?.ownerName} />
        <Row label="Gender" value={e?.gender} />
        <Row label="Social category" value={e?.socialCategory} />
        <Row label="Registered address (as per Udyam)" value={e?.addressLine} />
        <Row label="Date of Udyam registration" value={e ? new Date(e.registeredOn).toLocaleDateString('en-IN') : null} />
        <Row label="Enterprise type" value={e?.enterpriseSize} />
        <Row label="Major activity" value={e?.activity} />
        <Row label="Organisation type" value={e?.organisationType} />
        <Row label="PAN" value={e?.pan} />
        <Row label="Number of employees" value={e?.totalEmployees != null ? String(e.totalEmployees) : null} />
      </Card>

      <Card>
        <Text style={styles.section}>SPOC Contact Details</Text>
        <Row label="Name" value={s?.name} />
        <Row label="Designation" value={s?.designation} />
        <Row label="Email" value={s?.email} />
        <Row label="Mobile" value={s?.mobile} />
      </Card>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value?: string | null }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: type.section, fontWeight: '700', color: colour.text, marginBottom: space(1) },
  readonly: { fontSize: type.tiny, color: colour.muted, marginBottom: space(2), lineHeight: 16 },
  row: { marginTop: space(3) },
  label: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.4, color: colour.muted },
  value: { fontSize: type.small, fontWeight: '600', color: colour.text, marginTop: 2 },
});
