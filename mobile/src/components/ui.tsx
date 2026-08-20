import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { colour, radius, space, type } from '../theme/theme';

// ------------------------------------------------------------------ card ---

export function Card({
  children,
  style,
  capped,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Draws the 3 px green edge the web card carries. */
  capped?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.card, style]}>
      {capped ? <View style={styles.cardCap} /> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

// -------------------------------------------------------------- step head ---

export function StepHead({
  step,
  title,
  subtitle,
}: {
  step: number;
  title: string;
  subtitle?: string;
}): React.JSX.Element {
  return (
    <View style={styles.stepHead}>
      <View style={styles.stepNo}>
        <Text style={styles.stepNoText}>{step}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.stepTitle}>{title}</Text>
        {subtitle ? <Text style={styles.stepSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// ----------------------------------------------------------------- field ---

export function Field({
  label,
  required,
  hint,
  error,
  ...input
}: TextInputProps & {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label.toUpperCase()}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <TextInput
        {...input}
        style={[styles.input, error ? styles.inputBad : null]}
        placeholderTextColor={colour.placeholder}
      />

      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------- buttons ---

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}): React.JSX.Element {
  const off = Boolean(disabled ?? busy);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.primary,
        pressed && !off ? styles.primaryPressed : null,
        off ? styles.buttonOff : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colour.surface} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, pressed ? styles.ghostPressed : null, style]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------- choice card ---

export function ChoiceCard({
  selected,
  blocked,
  onPress,
  children,
  tag,
}: {
  selected?: boolean;
  blocked?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  tag?: { text: string; bad?: boolean };
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[
        styles.choice,
        selected ? styles.choiceOn : null,
        blocked ? styles.choiceBlocked : null,
      ]}
    >
      <View style={styles.choiceRow}>
        <View style={[styles.radio, selected ? styles.radioOn : null]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>

        <View style={styles.flex}>{children}</View>

        {tag ? (
          <View style={[styles.tag, tag.bad ? styles.tagBad : null]}>
            <Text style={[styles.tagText, tag.bad ? styles.tagTextBad : null]}>{tag.text}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// -------------------------------------------------------- section banner ---

export function SectionBand({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}): React.JSX.Element {
  return (
    <View style={styles.band}>
      <Text style={styles.bandTitle}>{title.toUpperCase()}</Text>
      {detail ? <Text style={styles.bandDetail}>{detail}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- dialog ---

/** Validation is raised here, not inline — the web portal does the same. */
export function AlertDialog({
  visible,
  title,
  text,
  onClose,
}: {
  visible: boolean;
  title: string;
  text: string;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <ScrollView style={styles.dialogScroll}>
            <Text style={styles.dialogText}>{text}</Text>
          </ScrollView>
          <PrimaryButton label="OK" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// -------------------------------------------------------- offline banner ---

export function OfflineBanner({
  online,
  queued,
}: {
  online: boolean;
  queued: number;
}): React.JSX.Element | null {
  if (online && queued === 0) return null;

  const text = !online
    ? 'Offline — your answers are saved on this device and will be sent when you reconnect.'
    : `Sending ${queued} saved ${queued === 1 ? 'item' : 'items'}…`;

  return (
    <View style={[styles.banner, online ? styles.bannerSyncing : null]}>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  card: {
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space(4),
  },
  cardCap: { height: 3, backgroundColor: colour.green },
  cardBody: { padding: space(5) },

  stepHead: { flexDirection: 'row', gap: space(3), marginBottom: space(5) },
  stepNo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colour.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNoText: { color: colour.surface, fontWeight: '700', fontSize: type.small },
  stepTitle: { fontSize: type.section, fontWeight: '700', color: colour.text },
  stepSub: { fontSize: type.small, color: colour.muted, marginTop: space(1), lineHeight: 19 },

  field: { marginBottom: space(4) },
  label: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colour.muted,
    marginBottom: space(2),
  },
  required: { color: colour.danger },
  input: {
    height: 48,
    paddingHorizontal: space(3),
    borderWidth: 1,
    borderColor: colour.input,
    borderRadius: radius.sm,
    backgroundColor: colour.surface,
    fontSize: type.body,
    color: colour.text,
  },
  inputBad: { borderColor: colour.danger },
  hint: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5) },
  fieldError: { fontSize: type.tiny, fontWeight: '600', color: colour.danger, marginTop: space(1.5) },

  primary: {
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colour.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(5),
  },
  primaryPressed: { backgroundColor: colour.blueDark },
  primaryText: { color: colour.surface, fontWeight: '700', fontSize: type.body },
  buttonOff: { opacity: 0.55 },

  ghost: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colour.input,
    backgroundColor: colour.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(5),
  },
  ghostPressed: { backgroundColor: colour.page },
  ghostText: { color: colour.text, fontWeight: '700', fontSize: type.body },

  choice: {
    borderWidth: 1.5,
    borderColor: colour.input,
    borderRadius: radius.lg,
    backgroundColor: colour.surface,
    padding: space(4),
    marginBottom: space(3),
  },
  choiceOn: { borderColor: colour.blue, backgroundColor: colour.blueTint },
  choiceBlocked: { backgroundColor: colour.dangerTint, borderColor: colour.danger },
  choiceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colour.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space(0.5),
  },
  radioOn: { borderColor: colour.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colour.blue },

  tag: {
    borderWidth: 1,
    borderColor: colour.blueLine,
    backgroundColor: colour.surface,
    borderRadius: radius.sm,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  tagBad: { borderColor: colour.danger },
  tagText: { fontSize: type.tiny, fontWeight: '600', color: colour.blue },
  tagTextBad: { color: colour.danger },

  band: {
    backgroundColor: colour.greenTint,
    borderWidth: 1,
    borderColor: colour.greenLine,
    borderLeftWidth: 3,
    borderLeftColor: colour.green,
    borderRadius: radius.sm,
    paddingVertical: space(3),
    paddingHorizontal: space(3.5),
    marginBottom: space(3),
  },
  bandTitle: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.4, color: colour.body },
  bandDetail: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5), lineHeight: 17 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22,33,26,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colour.surface,
    borderRadius: 12,
    padding: space(6),
  },
  dialogScroll: { maxHeight: 220 },
  dialogTitle: { fontSize: type.section, fontWeight: '700', color: colour.text },
  dialogText: { fontSize: type.small, lineHeight: 21, color: colour.body, marginVertical: space(3) },

  banner: {
    backgroundColor: '#FEF6E7',
    borderBottomWidth: 1,
    borderBottomColor: '#F3D9A6',
    paddingVertical: space(2.5),
    paddingHorizontal: space(4),
  },
  bannerSyncing: { backgroundColor: colour.blueTint, borderBottomColor: colour.blueLine },
  bannerText: { fontSize: type.tiny, color: colour.body, lineHeight: 16 },
});
