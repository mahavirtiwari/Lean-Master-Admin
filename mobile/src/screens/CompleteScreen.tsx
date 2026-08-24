import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { downloadDraftPledge, pledgeFileName } from '../api/pledge';
import { AlertDialog, Card, GhostButton, PrimaryButton } from '../components/ui';
import { RegShell } from '../components/RegShell';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Complete'>;

export default function CompleteScreen({ navigation, route }: Props): React.JSX.Element {
  const { leanId, enterpriseName, spocEmail, queued: pending, token, udyamNumber } = route.params;

  const [downloading, setDownloading] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  /**
   * The certificate for the completed registration. Offered here as well as on
   * the pledge screen, because this is the screen somebody keeps open.
   */
  async function takeCopy(): Promise<void> {
    if (!token || downloading) return;

    setDownloading(true);
    try {
      await downloadDraftPledge(token, pledgeFileName(udyamNumber));
    } catch (error) {
      setDialog({
        title: 'Could not download',
        text:
          error instanceof Error
            ? error.message
            : 'The certificate could not be prepared. Please try again.',
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <RegShell title={pending ? 'Registration Saved' : 'Registration Successful'}>
        <Card capped>
          <View style={styles.mark}>
            <Text style={styles.markText}>{pending ? '⏳' : '✓'}</Text>
          </View>

          <Text style={styles.title}>
            {pending ? 'Saved — waiting to send' : 'Registration complete'}
          </Text>

          {pending ? (
            <>
              <Text style={styles.sub}>
                {enterpriseName ? `The registration for ${enterpriseName} is` : 'Your registration is'}{' '}
                saved on this device and will be submitted automatically when you reconnect.
              </Text>
              <Text style={styles.sub}>
                The LEAN ID is issued by the scheme when the registration reaches the server, so it
                is not available yet. It will be e-mailed to your SPOC address with the password.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.sub}>
                Your LEAN ID and password have been sent to the verified SPOC e-mail address.
              </Text>

              <View style={styles.idBox}>
                <Text style={styles.idLabel}>YOUR LEAN ID</Text>
                <Text style={styles.idValue}>{leanId}</Text>
                <Text style={styles.idHint}>System-generated — use this to sign in</Text>
              </View>

              {spocEmail ? <Text style={styles.sent}>Sent to {spocEmail}</Text> : null}
            </>
          )}

          {token && !pending ? (
            <GhostButton
              label={downloading ? 'Preparing…' : 'Download LEAN Pledge'}
              onPress={takeCopy}
              style={styles.copy}
            />
          ) : null}

          <PrimaryButton
            label="Go to sign in"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] })}
            style={styles.cta}
          />
          <GhostButton
            label="Back to start"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'RegisterLanding' }] })}
          />
        </Card>

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </RegShell>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colour.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: space(4),
  },
  markText: { fontSize: 26, color: colour.green },

  title: { fontSize: type.title, fontWeight: '700', color: colour.text, textAlign: 'center' },
  sub: {
    fontSize: type.small,
    color: colour.muted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: space(3),
  },

  idBox: {
    backgroundColor: colour.surfaceQuiet,
    borderWidth: 1,
    borderColor: colour.line,
    // The blue the artboard runs along the top of the LEAN ID panel.
    borderTopWidth: 3,
    borderTopColor: colour.blue,
    borderRadius: radius.md,
    padding: space(4),
    alignItems: 'center',
    marginTop: space(5),
  },
  idLabel: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.5, color: colour.muted },
  idValue: { fontSize: type.title, fontWeight: '700', color: colour.text, marginTop: space(2) },
  idHint: { fontSize: type.tiny, color: colour.muted, marginTop: space(1.5) },

  sent: { fontSize: type.tiny, color: colour.muted, textAlign: 'center', marginTop: space(3) },
  copy: { marginTop: space(6) },
  cta: { marginTop: space(3), marginBottom: space(3) },
});
