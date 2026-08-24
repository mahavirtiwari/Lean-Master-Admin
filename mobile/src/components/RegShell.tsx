import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colour, radius, space, type } from '../theme/theme';
import { GearField } from './GearField';

/**
 * The frame the registration wizard (R-series) shares, as the artboards draw it:
 * the blue MCLS bar carrying the screen title and "Step X of 7", a white
 * Back/Refresh sub-bar beneath it, the scrolling content, and a fixed bottom
 * action bar. Passing a footer renders that bar; omit it for a screen that has
 * none.
 */
export function RegShell({
  title,
  step,
  total = 7,
  onRefresh,
  footer,
  children,
}: {
  title: string;
  step?: number;
  total?: number;
  onRefresh?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={['#2A6BAE', '#1B4F8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={[styles.bar, { paddingTop: insets.top + space(2) }]}
      >
        <View style={styles.barText}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {step ? <Text style={styles.step}>Step {step} of {total}</Text> : null}
        </View>
        <Text style={styles.brand}>MCLS</Text>
      </LinearGradient>

      <View style={styles.subBar}>
        {navigation.canGoBack() ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        ) : <View />}
        {onRefresh ? (
          <Pressable onPress={onRefresh} hitSlop={8}>
            <Text style={styles.refresh}>Refresh ↻</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Faint gears over the light ground, in the scrolling area only. */}
      <View style={styles.field}>
        <GearField headerSafe />
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  // The title column inside the blue bar — flex only, no background, so it does
  // not paint a light patch over the gradient.
  barText: { flex: 1 },
  field: { flex: 1, backgroundColor: '#F6F9F7' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingBottom: space(3.5),
    backgroundColor: colour.blue,
  },
  title: { fontSize: type.section, fontWeight: '700', color: colour.surface },
  step: { fontSize: type.tiny, color: '#C3D8EE', marginTop: 1 },
  brand: { fontSize: type.body, fontWeight: '800', letterSpacing: 0.5, color: colour.surface },

  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    backgroundColor: colour.surface,
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
  },
  back: { fontSize: type.body, fontWeight: '700', color: colour.blue },
  refresh: { fontSize: type.small, fontWeight: '600', color: colour.blue },

  page: { padding: space(4), paddingBottom: space(6) },

  footer: {
    flexDirection: 'row',
    gap: space(3),
    paddingHorizontal: space(4),
    paddingTop: space(3),
    backgroundColor: colour.surface,
    borderTopWidth: 1,
    borderTopColor: colour.line,
  },
});

// ---- shared footer buttons the wizard uses ----

export function RegPrimary({ label, onPress, busy, disabled, style }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; style?: object }): React.JSX.Element {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [fstyles.primary, pressed && !off ? fstyles.pressed : null, off ? fstyles.off : null, style]}
    >
      <Text style={fstyles.primaryText}>{busy ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

export function RegGhost({ label, onPress, style }: { label: string; onPress: () => void; style?: object }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [fstyles.ghost, pressed ? fstyles.pressed : null, style]}>
      <Text style={fstyles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const fstyles = StyleSheet.create({
  primary: { flex: 1, backgroundColor: colour.blue, borderRadius: radius.md, paddingVertical: space(3.5), alignItems: 'center' },
  primaryText: { color: colour.surface, fontSize: type.body, fontWeight: '700' },
  ghost: { flex: 1, backgroundColor: colour.surface, borderWidth: 1, borderColor: colour.input, borderRadius: radius.md, paddingVertical: space(3.5), alignItems: 'center' },
  ghostText: { color: colour.text, fontSize: type.body, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.6 },
});
