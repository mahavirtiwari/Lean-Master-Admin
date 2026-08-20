import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError } from '../api/client';
import { complete, type RegistrationDraft } from '../api/registration';
import { enqueue } from '../offline/db';
import { AlertDialog, Card, GhostButton, OfflineBanner, PrimaryButton, StepHead } from '../components/ui';
import { useApp } from '../state/AppContext';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Pledge'>;

const PLEDGE = [
  'I/We understand that the MSME Competitive (Lean) Scheme is voluntary and recognize the ' +
    'authority of the Ministry of MSME, Government of India, in issuance of any Level.',
  'I/We hereby give our commitment to complete the entire Lean Scheme journey as per the ' +
    'guidelines. By proceeding I/We certify that my/our Enterprise/Unit complies with & fulfils ' +
    'all relevant & applicable regulatory & statutory norms/licenses pertaining to the ' +
    'functioning of this manufacturing unit. If not, then efforts will be taken to fulfil those ' +
    'regulatory/statutory requirements by me/us. If at any stage the Enterprise/Unit is found to ' +
    'be non-compliant with any relevant/applicable regulatory & statutory norms, the competent ' +
    'authority will have the right to recall/withdraw any or all reports or Level Issued.',
];

export default function PledgeScreen({ navigation }: Props): React.JSX.Element {
  const { online, queued, draft, saveDraft, resetDraft, sync } = useApp();

  const stored = draft.payload.draft as RegistrationDraft | undefined;

  const [accepted, setAccepted] = useState(false);

  // The pledge has to be read to the end before it can be made. See the web
  // wizard's R8, which gates the same button the same way.
  const [read, setRead] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);

  function onPledgeScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 8) setRead(true);
  }

  function onPledgeFrame(event: LayoutChangeEvent): void {
    setFrameHeight(event.nativeEvent.layout.height);
  }

  // A pledge that fits inside its frame cannot be scrolled, so it counts as
  // read as soon as it is on screen — otherwise the button would never open.
  function onPledgeContent(_width: number, height: number): void {
    if (frameHeight > 0 && height <= frameHeight + 4) setRead(true);
  }
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  async function submit(): Promise<void> {
    if (!read) {
      return setDialog({
        title: 'Please read the pledge',
        text: 'Scroll to the end of the pledge before pledging.',
      });
    }

    if (!accepted) {
      return setDialog({ title: 'Please check', text: 'Accept the LEAN Pledge to complete your registration.' });
    }

    const token = draft.sessionToken;
    if (!token) {
      return setDialog({ title: 'Start again', text: 'This draft has no session. Please start the registration again.' });
    }

    const body = { acceptPledge: true };

    // Offline the submission is queued rather than refused. The LEAN ID is
    // issued by the server, so it cannot be shown yet — the completion screen
    // says the registration is pending instead of inventing one.
    if (!online) {
      await enqueue('POST', `/api/registration/${token}/complete`, body);
      await saveDraft({ step: 9 });

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Complete',
            params: {
              leanId: '',
              enterpriseName: stored?.enterprise?.enterpriseName ?? '',
              spocEmail: '',
              queued: true,
              token,
              udyamNumber: stored?.enterprise?.udyamNumber,
            },
          },
        ],
      });
      return;
    }

    setBusy(true);
    try {
      const result = await complete(token, body);
      await resetDraft();

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Complete',
            params: {
              leanId: result.leanId,
              enterpriseName: result.enterpriseName,
              spocEmail: result.spocEmail,
              token,
              udyamNumber: stored?.enterprise?.udyamNumber,
            },
          },
        ],
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setDialog({ title: 'Could not complete', text: error.message });
      } else {
        await enqueue('POST', `/api/registration/${token}/complete`, body);
        void sync();
        setDialog({
          title: 'Saved on this device',
          text:
            'The server could not be reached. Your registration is saved and will be submitted ' +
            'automatically when you reconnect.',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <OfflineBanner online={online} queued={queued} />

      <ScrollView contentContainerStyle={styles.page}>
        <Card>
          <StepHead
            step={8}
            title="LEAN Pledge"
            subtitle="Read the pledge and accept it to complete your registration"
          />

          <ScrollView
            style={styles.pledge}
            contentContainerStyle={styles.pledgeInner}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScroll={onPledgeScroll}
            onLayout={onPledgeFrame}
            onContentSizeChange={onPledgeContent}
          >
            {PLEDGE.map((paragraph) => (
              <Text key={paragraph} style={styles.pledgeText}>
                {paragraph}
              </Text>
            ))}
          </ScrollView>

          {read ? null : (
            <Text style={styles.pledgeHint}>Scroll to the end of the pledge to continue.</Text>
          )}

          <Pressable style={styles.check} onPress={() => setAccepted((v) => !v)}>
            <View style={[styles.box, accepted ? styles.boxOn : null]}>
              {accepted ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.checkText}>
              On behalf of the enterprise, I accept the LEAN Pledge and confirm the details provided.
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.half} />
            <PrimaryButton
              label="I/We Pledge"
              onPress={submit}
              busy={busy}
              disabled={busy || !read || !accepted}
              style={styles.half}
            />
          </View>
        </Card>
      </ScrollView>

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colour.page },
  half: { flex: 1 },
  page: { padding: space(4), paddingBottom: space(10) },

  pledge: {
    maxHeight: 260,
    backgroundColor: colour.surfaceQuiet,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.md,
    marginBottom: space(3),
  },
  pledgeInner: { padding: space(4) },
  pledgeHint: { fontSize: type.tiny, color: colour.muted, marginBottom: space(4) },

  pledgeText: {
    fontSize: type.small + 2,
    color: colour.body,
    lineHeight: 24,
    marginTop: space(3),
  },

  check: {
    flexDirection: 'row',
    gap: space(3),
    alignItems: 'center',
    marginBottom: space(5),
    padding: space(4),
    backgroundColor: colour.greenTint,
    borderWidth: 1,
    borderColor: colour.greenLine,
    borderRadius: radius.md,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colour.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colour.blue, borderColor: colour.blue },
  tick: { color: colour.surface, fontSize: type.small, fontWeight: '700' },
  checkText: { flex: 1, fontSize: type.small, color: colour.body, lineHeight: 20 },

  actions: { flexDirection: 'row', gap: space(3) },
});
