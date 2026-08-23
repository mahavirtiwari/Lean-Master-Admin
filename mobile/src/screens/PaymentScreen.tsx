import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { paySilver, silverFee, silverSubmission, type PaymentReceipt, type SilverFee } from '../api/application';
import { AppShell } from '../components/AppShell';
import { Card, GhostButton, PrimaryButton } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Payments'>;

const METHODS = [
  { code: 'UPI', label: 'UPI', hint: 'GPay, PhonePe, Paytm, BHIM', tag: 'Instant' },
  { code: 'Card', label: 'Credit / Debit card', hint: 'Visa, Mastercard, RuPay', tag: '' },
  { code: 'NetBanking', label: 'Net banking', hint: 'All major banks', tag: '' },
  { code: 'NEFT', label: 'NEFT / RTGS', hint: 'Takes 1–2 working days to reflect', tag: '' },
];

/** ₹ with Indian digit grouping. */
function inr(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

type Stage = 'loading' | 'methods' | 'processing' | 'success' | 'failed' | 'nothing';

/**
 * The Silver fee payment (Y-series). The fee summary and the method list, then
 * a simulated payment that walks processing → success (or a declined path). No
 * money moves and no card details are handled here — the server records the
 * payment against the application and returns a reference.
 */
export default function PaymentScreen({ navigation }: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('loading');
  const [fee, setFee] = useState<SilverFee | null>(null);
  const [method, setMethod] = useState('UPI');
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [f, sub] = await Promise.all([silverFee(), silverSubmission().catch(() => null)]);
        setFee(f);
        if (sub && sub.status !== 'Submitted') {
          setStage('nothing');
        } else if (sub && (sub as { paymentStatus?: string }).paymentStatus === 'Paid') {
          const s = sub as unknown as { paymentReference: string; paidAmount: number; paymentMethod: string; paidOnUtc: string };
          setReceipt({ reference: s.paymentReference, amount: s.paidAmount, method: s.paymentMethod, paidOn: s.paidOnUtc });
          setStage('success');
        } else {
          setStage(sub ? 'methods' : 'nothing');
        }
      } catch {
        setStage('nothing');
      }
    })();
  }, []);

  async function pay(simulateFailure: boolean): Promise<void> {
    setStage('processing');
    setError(null);
    try {
      const r = await paySilver(method, simulateFailure);
      setReceipt(r);
      setStage('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The payment could not be completed.');
      setStage('failed');
    }
  }

  return (
    <AppShell title="Payment" canGoBack>
      {stage === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={colour.green} size="large" /></View>
      ) : null}

      {stage === 'nothing' ? (
        <Card capped>
          <Text style={styles.h}>No fee due yet</Text>
          <Text style={styles.p}>
            Submit your LEAN Silver application first — the fee becomes payable once it is submitted.
          </Text>
          <GhostButton label="Back to home" onPress={() => navigation.navigate('Home')} style={styles.mt} />
        </Card>
      ) : null}

      {stage === 'methods' && fee ? (
        <>
          <Card capped>
            <Text style={styles.label}>AMOUNT PAYABLE</Text>
            <Text style={styles.amount}>{inr(fee.payable)}</Text>
            <View style={styles.breakdown}>
              <Row k="Certification fee (incl. GST)" v={inr(fee.gross)} />
              <Row k={`Government subsidy (${fee.subsidyPercent}%)`} v={'– ' + inr(fee.subsidyAmount)} good />
              <View style={styles.rule} />
              <Row k="You pay" v={inr(fee.payable)} strong />
            </View>
          </Card>

          <Text style={styles.heading}>Choose a payment method</Text>
          {METHODS.map((m) => (
            <Pressable key={m.code} onPress={() => setMethod(m.code)}>
              <Card style={{ ...styles.method, ...(method === m.code ? styles.methodOn : {}) }}>
                <View style={styles.flex}>
                  <Text style={styles.mLabel}>{m.label}</Text>
                  <Text style={styles.mHint}>{m.hint}</Text>
                </View>
                {m.tag ? <Text style={styles.tag}>{m.tag}</Text> : null}
                <View style={[styles.radio, method === m.code ? styles.radioOn : null]}>
                  {method === m.code ? <View style={styles.radioDot} /> : null}
                </View>
              </Card>
            </Pressable>
          ))}

          <Text style={styles.note}>
            Payments are processed on the Government of India payment gateway. MCLS never stores your
            card details.
          </Text>

          <PrimaryButton label={`Pay ${inr(fee.payable)}`} onPress={() => void pay(false)} style={styles.mt} />
          <GhostButton label="Simulate a declined payment" onPress={() => void pay(true)} style={styles.mt} />
        </>
      ) : null}

      {stage === 'processing' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colour.blue} size="large" />
          <Text style={styles.processing}>Processing your payment…</Text>
          <Text style={styles.p}>Do not close the app or press back.</Text>
        </View>
      ) : null}

      {stage === 'success' && receipt ? (
        <>
          <Card capped>
            <View style={styles.tickWrap}><View style={styles.tick}><Text style={styles.tickMark}>✓</Text></View></View>
            <Text style={styles.h}>Payment successful</Text>
            <Text style={styles.p}>{inr(receipt.amount)} paid. Handholding can now begin.</Text>
          </Card>
          <Card>
            <Row k="Reference" v={receipt.reference} strong />
            <Row k="Amount" v={inr(receipt.amount)} />
            <Row k="Method" v={receipt.method} />
            <Row k="Paid on" v={new Date(receipt.paidOn).toLocaleString('en-IN')} />
          </Card>
          <PrimaryButton label="Back to home" onPress={() => navigation.navigate('Home')} style={styles.mt} />
        </>
      ) : null}

      {stage === 'failed' ? (
        <Card capped>
          <View style={styles.tickWrap}><View style={styles.cross}><Text style={styles.crossMark}>!</Text></View></View>
          <Text style={styles.h}>Payment not completed</Text>
          <Text style={styles.p}>{error ?? 'No amount has been charged. You can try again.'}</Text>
          <PrimaryButton label="Try again" onPress={() => setStage('methods')} style={styles.mt} />
        </Card>
      ) : null}
    </AppShell>
  );
}

function Row({ k, v, good, strong }: { k: string; v: string; good?: boolean; strong?: boolean }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={[styles.rowV, good ? styles.rowGood : null, strong ? styles.rowStrong : null]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space(10) },
  flex: { flex: 1 },
  mt: { marginTop: space(3) },

  label: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.5, color: colour.muted },
  amount: { fontSize: type.hero, fontWeight: '800', color: colour.text, marginTop: space(1) },
  breakdown: { marginTop: space(3) },
  rule: { height: 1, backgroundColor: colour.line, marginVertical: space(2) },

  heading: {
    fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.4, color: colour.muted,
    textTransform: 'uppercase', marginTop: space(5), marginBottom: space(2),
  },

  method: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2), borderWidth: 1, borderColor: colour.line },
  methodOn: { borderColor: colour.green, backgroundColor: colour.greenTint },
  mLabel: { fontSize: type.small, fontWeight: '700', color: colour.text },
  mHint: { fontSize: type.tiny, color: colour.muted, marginTop: 1 },
  tag: { fontSize: type.tiny, fontWeight: '700', color: colour.green },
  radio: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 2, borderColor: colour.input, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colour.green },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colour.green },

  note: { fontSize: type.tiny, color: colour.muted, marginTop: space(3), lineHeight: 18 },

  processing: { fontSize: type.section, fontWeight: '700', color: colour.text, marginTop: space(4) },

  tickWrap: { alignItems: 'center', marginBottom: space(2) },
  tick: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colour.greenTint, borderWidth: 1, borderColor: colour.greenLine, alignItems: 'center', justifyContent: 'center' },
  tickMark: { fontSize: 28, color: colour.green, fontWeight: '800' },
  cross: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colour.dangerTint, alignItems: 'center', justifyContent: 'center' },
  crossMark: { fontSize: 28, color: colour.danger, fontWeight: '800' },

  h: { fontSize: type.title, fontWeight: '800', color: colour.text, textAlign: 'center' },
  p: { fontSize: type.small, color: colour.body, textAlign: 'center', marginTop: space(1), lineHeight: 20 },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space(1.5) },
  rowK: { fontSize: type.small, color: colour.body, flex: 1 },
  rowV: { fontSize: type.small, color: colour.text, fontWeight: '600' },
  rowGood: { color: colour.green },
  rowStrong: { fontWeight: '800', fontSize: type.body },
});
