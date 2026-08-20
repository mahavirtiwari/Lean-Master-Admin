import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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

/** How long the whole pledge takes to pass through its frame. */
const CRAWL_MS = 20_000;
const TICK_MS = 50;

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

  // The pledge is taken, not ticked: it carries itself through its frame, and
  // I/We Pledge opens only once the whole text has gone by. Scrolling ahead by
  // hand counts too. Same rule as the web wizard's R8.
  const [read, setRead] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const frame = useRef<ScrollView>(null);
  const position = useRef(0);

  function onPledgeScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

    // A reader scrolling by hand takes the crawl over from here.
    position.current = contentOffset.y;

    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 8) setRead(true);
  }

  // Carries the pledge down at a pace that shows all of it in CRAWL_MS,
  // whatever its height — the same wait on a small screen as on a large one.
  useEffect(() => {
    const range = contentHeight - frameHeight;

    // Nothing to carry: a pledge that fits its frame has been read as soon as
    // it is shown, and waiting for a scroll that cannot happen would leave the
    // button shut for good.
    if (frameHeight <= 0 || contentHeight <= 0) return undefined;

    if (range <= 4) {
      setRead(true);
      return undefined;
    }

    const perTick = (range / CRAWL_MS) * TICK_MS;

    const timer = setInterval(() => {
      position.current += perTick;
      frame.current?.scrollTo({ y: position.current, animated: false });

      if (position.current + frameHeight >= contentHeight - 4) {
        setRead(true);
        clearInterval(timer);
      }
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [contentHeight, frameHeight]);

  function onPledgeFrame(event: LayoutChangeEvent): void {
    setFrameHeight(event.nativeEvent.layout.height);
  }

  function onPledgeContent(_width: number, height: number): void {
    setContentHeight(height);
  }
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  async function submit(): Promise<void> {
    if (!read) {
      return setDialog({
        title: 'Please read the pledge',
        text: 'Let the pledge finish, or scroll to its end, before pledging.',
      });
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
            ref={frame}
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
            <Text style={styles.pledgeHint}>
              I/We Pledge opens once the whole pledge has been shown. You can scroll ahead.
            </Text>
          )}

          <View style={styles.actions}>
            <GhostButton label="Back" onPress={() => navigation.goBack()} style={styles.half} />
            <PrimaryButton
              label="I/We Pledge"
              onPress={submit}
              busy={busy}
              disabled={busy || !read}
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

  actions: { flexDirection: 'row', gap: space(3) },
});
