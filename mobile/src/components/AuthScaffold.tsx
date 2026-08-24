import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colour, space, type } from '../theme/theme';
import { GearField } from './GearField';

/**
 * The frame the pre-login (A-series) screens share: a light ground, the MCLS
 * logo centred, then a heading with the artboards' green accent underline and a
 * subtitle, over the screen's own cards. No app bar — these come before the
 * signed-in shell.
 */
export function AuthScaffold({
  title,
  accent,
  subtitle,
  children,
}: {
  /** The heading in ink; <see cref="accent"/> is appended in green. */
  title: string;
  accent?: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      {/* The artboards' green ground and its faint gears, behind everything. */}
      <LinearGradient
        colors={['#F7FCF9', '#EAF6EF', '#DBEDE3']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <GearField />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space(8) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('../../assets/mcls-logo.png')} style={styles.logo} resizeMode="contain" />

        <Text style={styles.title}>
          {title}
          {accent ? <Text style={styles.accent}> {accent}</Text> : null}
        </Text>
        <View style={styles.rule} />
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        <View style={styles.body}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  page: { paddingHorizontal: space(5), paddingBottom: space(10), alignItems: 'center' },
  logo: { width: 190, height: 52, marginBottom: space(4) },
  title: { fontSize: type.hero, fontWeight: '800', color: colour.text, textAlign: 'center' },
  accent: { color: colour.green },
  rule: { width: 40, height: 3, borderRadius: 2, backgroundColor: colour.green, marginTop: space(2) },
  subtitle: {
    fontSize: type.small,
    color: colour.muted,
    textAlign: 'center',
    marginTop: space(2),
    lineHeight: 20,
  },
  body: { width: '100%', marginTop: space(5), gap: space(3) },
});
