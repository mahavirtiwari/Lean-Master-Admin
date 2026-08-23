import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dashboard } from '../api/registration';
import { useApp } from '../state/AppContext';
import { colour, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';
import { OfflineBanner } from './ui';
import { SidePane } from './SidePane';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The frame every post-login screen sits in: an app bar carrying the hamburger,
 * the title and an optional back arrow, over the left navigation pane. The pane
 * reads the enterprise identity from the cached dashboard, so it is right on
 * whichever screen it is opened from.
 */
export function AppShell({
  title,
  canGoBack,
  children,
  scroll = true,
}: {
  title: string;
  canGoBack?: boolean;
  children: React.ReactNode;
  scroll?: boolean;
}): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { online, queued, user } = useApp();

  const [paneOpen, setPaneOpen] = useState(false);
  const [identity, setIdentity] = useState({
    leanId: user?.userCode ?? '—',
    name: user?.fullName ?? '',
    unitName: null as string | null,
    address: null as string | null,
  });

  useEffect(() => {
    void (async () => {
      try {
        const result = await dashboard();
        const e = result.data?.enterprise;
        if (e) {
          setIdentity({
            leanId: e.leanId,
            name: e.name,
            unitName: e.unit?.unitName ?? null,
            address: [e.unit?.address, e.unit?.state, e.unit?.pincode].filter(Boolean).join(', ') || null,
          });
        }
      } catch {
        // The pane falls back to the signed-in user's own code and name.
      }
    })();
  }, []);

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <View style={[styles.bar, { paddingTop: insets.top + space(2) }]}>
        {canGoBack ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.icon}>‹</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setPaneOpen(true)} hitSlop={10} style={styles.iconBtn}>
            <Text style={styles.hamburger}>☰</Text>
          </Pressable>
        )}

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <Pressable onPress={() => navigation.navigate('Notifications' as never)} hitSlop={10} style={styles.iconBtn}>
          <Text style={styles.icon}>🔔</Text>
        </Pressable>
      </View>

      {scroll ? (
        <ScrollView contentContainerStyle={styles.page}>{children}</ScrollView>
      ) : (
        <View style={styles.pageFlex}>{children}</View>
      )}

      <SidePane visible={paneOpen} onClose={() => setPaneOpen(false)} identity={identity} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    paddingBottom: space(3),
    backgroundColor: colour.surface,
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  hamburger: { fontSize: 20, color: colour.text },
  icon: { fontSize: 20, color: colour.text },
  title: { flex: 1, fontSize: type.section, fontWeight: '700', color: colour.text },

  page: { padding: space(4), paddingBottom: space(10) },
  pageFlex: { flex: 1 },
});
