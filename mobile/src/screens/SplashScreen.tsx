import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_VERSION } from '../config';
import { GearField } from '../components/GearField';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

/**
 * The landing screen (A01): the MCLS mark and scheme name, then the two doors —
 * sign in for a registered enterprise, register for a new one. Shown to anyone
 * not already signed in.
 */
export default function SplashScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom + space(6) }]}>
      <LinearGradient
        colors={['#F7FCF9', '#EAF6EF', '#DBEDE3']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <GearField />

      <View style={styles.hero}>
        <Image source={require('../../assets/mcls-logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.rule} />
        <Text style={styles.title}>
          MSME Competitive{'\n'}
          <Text style={styles.accent}>(LEAN) Scheme</Text>
        </Text>
        <Text style={styles.sub}>
          Ministry of Micro, Small &amp; Medium Enterprises, Government of India
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.primary, pressed ? styles.pressed : null]}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={styles.primaryText}>Sign in</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.register, pressed ? styles.pressed : null]}
          onPress={() => navigation.navigate('RegisterLanding')}
        >
          <Text style={styles.registerText}>Register Now</Text>
        </Pressable>
        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page, paddingHorizontal: space(6) },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 210, height: 58 },
  rule: { width: 44, height: 3, borderRadius: 2, backgroundColor: colour.green, marginTop: space(5), marginBottom: space(4) },
  title: { fontSize: type.hero, fontWeight: '800', color: colour.text, textAlign: 'center', lineHeight: 34 },
  accent: { color: colour.green },
  sub: { fontSize: type.small, color: colour.muted, textAlign: 'center', marginTop: space(3), lineHeight: 20, paddingHorizontal: space(4) },

  actions: { gap: space(3) },
  btn: { borderRadius: radius.md, paddingVertical: space(4), alignItems: 'center' },
  pressed: { opacity: 0.85 },
  primary: { backgroundColor: colour.blue },
  primaryText: { color: colour.surface, fontSize: type.body, fontWeight: '700' },
  register: { backgroundColor: colour.green },
  registerText: { color: colour.surface, fontSize: type.body, fontWeight: '700' },
  version: { fontSize: type.tiny, color: colour.placeholder, textAlign: 'center', marginTop: space(2) },
});
