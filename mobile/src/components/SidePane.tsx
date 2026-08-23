import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';
import { IdentityHeader } from './IdentityHeader';

const HELP_URL = 'https://ndie.qcin.org/contact-us/';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** One navigable destination in the pane. External items leave the app. */
interface PaneItem {
  label: string;
  hint: string;
  route?: keyof RootStackParamList;
  url?: string;
}

const ITEMS: PaneItem[] = [
  { label: 'Dashboard', hint: 'Home', route: 'Home' },
  { label: 'My Certifications', hint: 'Bronze, Silver and Gold levels', route: 'MyCertifications' },
  { label: 'My Incentives', hint: 'Benefits unlocked by certification', route: 'MyIncentives' },
  { label: 'Payments', hint: 'Fees and receipts', route: 'Payments' },
  { label: 'Documents', hint: 'Certificates, applications and invoices', route: 'Documents' },
  { label: 'Profile', hint: 'Enterprise and SPOC details', route: 'Profile' },
  { label: 'Help & Support', hint: 'Contact the NDIE desk', url: HELP_URL },
];

/**
 * The left navigation pane (N01). An overlay rather than a drawer: it needs no
 * gesture library, and it is how the prototype draws it — a sheet over the
 * screen with the enterprise identity at the top.
 */
export function SidePane({
  visible,
  onClose,
  identity,
}: {
  visible: boolean;
  onClose: () => void;
  identity: { leanId: string; name: string; unitName?: string | null; address?: string | null };
}): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const { signOut } = useApp();

  function go(item: PaneItem): void {
    onClose();
    if (item.url) {
      void Linking.openURL(item.url);
      return;
    }
    if (item.route) navigation.navigate(item.route as never);
  }

  async function leave(): Promise<void> {
    onClose();
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.pane} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.paneBody}>
            <IdentityHeader
              leanId={identity.leanId}
              name={identity.name}
              unitName={identity.unitName}
              address={identity.address}
            />

            <Text style={styles.heading}>Where do you want to go?</Text>

            {ITEMS.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => go(item)}
                style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
              >
                <View style={styles.flex}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  <Text style={styles.itemHint}>{item.hint}</Text>
                </View>
                <Text style={styles.chevron}>{item.url ? '↗' : '›'}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => void leave()}
              style={({ pressed }) => [styles.signOut, pressed ? styles.itemPressed : null]}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(22,33,26,0.45)', flexDirection: 'row' },
  pane: {
    width: '84%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: colour.page,
  },
  paneBody: { padding: space(4), paddingTop: space(12), gap: space(2) },
  flex: { flex: 1 },

  heading: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colour.muted,
    textTransform: 'uppercase',
    marginTop: space(5),
    marginBottom: space(2),
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.md,
    padding: space(3.5),
  },
  itemPressed: { backgroundColor: colour.greenTint },
  itemLabel: { fontSize: type.body, fontWeight: '700', color: colour.text },
  itemHint: { fontSize: type.tiny, color: colour.muted, marginTop: 2 },
  chevron: { fontSize: type.title, color: colour.placeholder },

  signOut: {
    marginTop: space(4),
    borderWidth: 1,
    borderColor: colour.dangerTint,
    backgroundColor: colour.dangerTint,
    borderRadius: radius.md,
    padding: space(3.5),
    alignItems: 'center',
  },
  signOutText: { fontSize: type.body, fontWeight: '700', color: colour.danger },
});
