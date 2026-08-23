import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { applicationConfig, saveSilver, silverSubmission, type ApplicationConfig } from '../api/application';
import { AppShell } from '../components/AppShell';
import { AlertDialog, Card, Field, GhostButton, PrimaryButton } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SilverApplication'>;

const STEPS = ['Basic information', 'ESG information', 'Documents', 'Review'] as const;
type Answer = 'Yes' | 'No' | 'NA';

/**
 * The LEAN Silver application (C03–C07): a four-step flow filling the checklist
 * the admin defines. Basic information, then the ESG questions — where a
 * conditional question appears only once its parent is answered its trigger —
 * then the document uploads, then a review before it is submitted.
 *
 * Answers are held here and sent whole; the server keeps one draft per
 * enterprise, so leaving and returning resumes where it was left.
 */
export default function SilverApplicationScreen({ navigation }: Props): React.JSX.Element {
  const [config, setConfig] = useState<ApplicationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  const [basic, setBasic] = useState<Record<number, string>>({});
  const [esg, setEsg] = useState<Record<number, Answer>>({});
  const [docs, setDocs] = useState<Record<number, string>>({});

  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [cfg, existing] = await Promise.all([applicationConfig(), silverSubmission().catch(() => null)]);
        setConfig(cfg);
        if (existing && existing.status !== 'Submitted') {
          setBasic(Object.fromEntries(existing.basicInfo.map((b) => [b.basicInfoItemId, b.valueText ?? ''])));
          setEsg(Object.fromEntries(existing.esg.map((e) => [e.esgQuestionId, e.answer])));
          setDocs(Object.fromEntries(existing.documents.map((d) => [d.documentRequirementId, d.originalFileName ?? ''])));
        }
      } catch {
        setDialog({ title: 'Could not load', text: 'The application form could not be loaded. Please try again.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The ESG questions that should be visible now: a top-level question, or a
  // child whose parent carries its trigger answer.
  const visibleEsg = useMemo(() => {
    if (!config) return new Set<number>();
    const shown = new Set<number>();
    for (const s of config.esgSections) {
      for (const q of s.questions) {
        if (q.parentQuestionId == null || esg[q.parentQuestionId] === q.showWhenAnswer) shown.add(q.esgQuestionId);
      }
    }
    return shown;
  }, [config, esg]);

  function payload(submit: boolean) {
    return {
      submit,
      basicInfo: Object.entries(basic).map(([id, value]) => ({ basicInfoItemId: +id, value })),
      esg: Object.entries(esg)
        .filter(([id]) => visibleEsg.has(+id))
        .map(([id, answer]) => ({ esgQuestionId: +id, answer })),
      documents: Object.entries(docs).map(([id, name]) => ({ documentRequirementId: +id, originalFileName: name })),
    };
  }

  async function saveDraft(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await saveSilver(payload(false));
      setDialog({ title: 'Draft saved', text: 'You can come back and finish this application later.' });
    } catch (e) {
      setDialog({ title: 'Could not save', text: e instanceof Error ? e.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await saveSilver(payload(true));
      navigation.replace('ApplicationSubmitted');
    } catch (e) {
      setDialog({ title: 'Not yet complete', text: e instanceof Error ? e.message : 'Please review your answers.' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="LEAN Silver" canGoBack scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colour.green} size="large" />
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="LEAN Silver" canGoBack>
      <Text style={styles.stepLine}>Step {step + 1} of 4 · {STEPS[step]}</Text>
      <View style={styles.progress}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.tick, i <= step ? styles.tickOn : null]} />
        ))}
      </View>

      {step === 0 ? <BasicStep config={config!} basic={basic} setBasic={setBasic} setDocMarker={setDocs} /> : null}
      {step === 1 ? <EsgStep config={config!} esg={esg} setEsg={setEsg} visible={visibleEsg} /> : null}
      {step === 2 ? <DocsStep config={config!} docs={docs} setDocs={setDocs} /> : null}
      {step === 3 ? <ReviewStep config={config!} basic={basic} esg={esg} docs={docs} visible={visibleEsg} /> : null}

      <View style={styles.footer}>
        {step > 0 ? <GhostButton label="Back" onPress={() => setStep((s) => s - 1)} style={styles.flex} /> : null}
        {step < 3 ? (
          <PrimaryButton label={`Continue to ${STEPS[step + 1]}`} onPress={() => setStep((s) => s + 1)} style={styles.flex} />
        ) : (
          <PrimaryButton label="Submit application" busy={busy} onPress={() => void submit()} style={styles.flex} />
        )}
      </View>
      <GhostButton label="Save draft & exit" onPress={() => void saveDraft()} style={styles.draft} />

      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        text={dialog?.text ?? ''}
        onClose={() => setDialog(null)}
      />
    </AppShell>
  );
}

// ---------------------------------------------------------------- steps ---

function BasicStep({
  config,
  basic,
  setBasic,
  setDocMarker,
}: {
  config: ApplicationConfig;
  basic: Record<number, string>;
  setBasic: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setDocMarker: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}): React.JSX.Element {
  const groups = groupBy(config.basicInfo, (i) => i.groupName);
  return (
    <>
      <Text style={styles.lead}>Everything here is declared by you. Photographs are captured on site.</Text>
      {Object.entries(groups).map(([group, items]) => (
        <Card key={group} style={styles.card}>
          <Text style={styles.groupName}>{group}</Text>
          {items.map((item) => (
            <View key={item.basicInfoItemId} style={styles.item}>
              {item.inputType === 'yesno' ? (
                <YesNo
                  label={item.label}
                  required={item.isRequired}
                  value={basic[item.basicInfoItemId] as 'Yes' | 'No' | undefined}
                  onChange={(v) => setBasic((s) => ({ ...s, [item.basicInfoItemId]: v }))}
                />
              ) : item.inputType === 'photo' ? (
                <Uploader
                  label={item.label}
                  hint={item.helpText}
                  value={basic[item.basicInfoItemId]}
                  onCapture={() => setBasic((s) => ({ ...s, [item.basicInfoItemId]: `${slug(item.label)}.jpg` }))}
                />
              ) : (
                <Field
                  label={item.label}
                  required={item.isRequired}
                  hint={item.helpText ?? undefined}
                  keyboardType={item.inputType === 'number' ? 'numeric' : 'default'}
                  value={basic[item.basicInfoItemId] ?? ''}
                  onChangeText={(v) => setBasic((s) => ({ ...s, [item.basicInfoItemId]: v }))}
                />
              )}
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

function EsgStep({
  config,
  esg,
  setEsg,
  visible,
}: {
  config: ApplicationConfig;
  esg: Record<number, Answer>;
  setEsg: React.Dispatch<React.SetStateAction<Record<number, Answer>>>;
  visible: Set<number>;
}): React.JSX.Element {
  return (
    <>
      <Text style={styles.lead}>
        Answer every question. Not Applicable is a valid answer where the requirement does not apply.
      </Text>
      {config.esgSections
        .filter((s) => s.questions.some((q) => visible.has(q.esgQuestionId)))
        .map((section) => (
          <Card key={section.esgSectionId} style={styles.card}>
            <Text style={styles.groupName}>{section.name}</Text>
            {section.questions
              .filter((q) => visible.has(q.esgQuestionId))
              .map((q, i) => (
                <View
                  key={q.esgQuestionId}
                  style={[styles.item, q.parentQuestionId ? styles.child : null]}
                >
                  <Text style={styles.qText}>
                    {q.parentQuestionId ? '↳ ' : `${i + 1}. `}
                    {q.text}
                  </Text>
                  {q.helpText ? <Text style={styles.qHelp}>{q.helpText}</Text> : null}
                  <Triple
                    value={esg[q.esgQuestionId]}
                    onChange={(v) => setEsg((s) => ({ ...s, [q.esgQuestionId]: v }))}
                  />
                </View>
              ))}
          </Card>
        ))}
    </>
  );
}

function DocsStep({
  config,
  docs,
  setDocs,
}: {
  config: ApplicationConfig;
  docs: Record<number, string>;
  setDocs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}): React.JSX.Element {
  const done = config.documents.filter((d) => docs[d.documentRequirementId]).length;
  return (
    <>
      <Text style={styles.lead}>
        {done} of {config.documents.length} uploaded. Photographs must show the actual unit.
      </Text>
      {config.documents.map((d) => (
        <Card key={d.documentRequirementId} style={styles.card}>
          <Uploader
            label={d.name + (d.isMandatory ? ' *' : '')}
            hint={d.helpText}
            value={docs[d.documentRequirementId]}
            onCapture={() =>
              setDocs((s) => ({ ...s, [d.documentRequirementId]: `${slug(d.name)}.jpg` }))
            }
          />
        </Card>
      ))}
    </>
  );
}

function ReviewStep({
  config,
  basic,
  esg,
  docs,
  visible,
}: {
  config: ApplicationConfig;
  basic: Record<number, string>;
  esg: Record<number, Answer>;
  docs: Record<number, string>;
  visible: Set<number>;
}): React.JSX.Element {
  const answered = [...visible].filter((id) => esg[id]).length;
  const docCount = config.documents.filter((d) => docs[d.documentRequirementId]).length;
  return (
    <>
      <Text style={styles.lead}>Check your answers, then submit. You cannot edit after submitting.</Text>
      <Card style={styles.card}>
        <Row label="Basic information" value={`${Object.values(basic).filter(Boolean).length} of ${config.basicInfo.length} filled`} />
        <Row label="ESG questions" value={`${answered} of ${visible.size} answered`} />
        <Row label="Documents" value={`${docCount} of ${config.documents.length} uploaded`} />
      </Card>
      <Text style={styles.declaration}>
        By submitting, I declare that the information provided is true to the best of my knowledge.
      </Text>
    </>
  );
}

// -------------------------------------------------------------- widgets ---

function Triple({ value, onChange }: { value?: Answer; onChange: (a: Answer) => void }): React.JSX.Element {
  const opts: Answer[] = ['Yes', 'No', 'NA'];
  return (
    <View style={styles.triple}>
      {opts.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={[styles.tripleBtn, value === o ? styles.tripleOn : null]}
        >
          <Text style={[styles.tripleText, value === o ? styles.tripleTextOn : null]}>
            {o === 'NA' ? 'N/A' : o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function YesNo({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value?: 'Yes' | 'No';
  onChange: (v: 'Yes' | 'No') => void;
}): React.JSX.Element {
  return (
    <View>
      <Text style={styles.qText}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <View style={styles.triple}>
        {(['Yes', 'No'] as const).map((o) => (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.tripleBtn, value === o ? styles.tripleOn : null]}>
            <Text style={[styles.tripleText, value === o ? styles.tripleTextOn : null]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Uploader({
  label,
  hint,
  value,
  onCapture,
}: {
  label: string;
  hint?: string | null;
  value?: string;
  onCapture: () => void;
}): React.JSX.Element {
  return (
    <View>
      <Text style={styles.qText}>{label}</Text>
      {hint ? <Text style={styles.qHelp}>{hint}</Text> : null}
      {value ? (
        <View style={styles.uploaded}>
          <Text style={styles.uploadedText}>✓ {value}</Text>
          <Pressable onPress={onCapture}>
            <Text style={styles.replace}>Replace</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onCapture} style={styles.upload}>
          <Text style={styles.uploadText}>＋ Capture / Upload</Text>
        </Pressable>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    (acc[key(item)] ??= []).push(item);
    return acc;
  }, {});
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },

  stepLine: { fontSize: type.small, fontWeight: '700', color: colour.green, marginBottom: space(2) },
  progress: { flexDirection: 'row', gap: space(1.5), marginBottom: space(4) },
  tick: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colour.line },
  tickOn: { backgroundColor: colour.green },

  lead: { fontSize: type.small, color: colour.body, marginBottom: space(3), lineHeight: 20 },
  card: { marginBottom: space(3) },
  groupName: { fontSize: type.section, fontWeight: '700', color: colour.text, marginBottom: space(2) },
  item: { marginTop: space(3) },
  child: {
    marginLeft: space(3),
    paddingLeft: space(3),
    borderLeftWidth: 2,
    borderLeftColor: colour.greenLine,
  },

  qText: { fontSize: type.small, fontWeight: '600', color: colour.text, lineHeight: 20 },
  qHelp: { fontSize: type.tiny, color: colour.muted, marginTop: 2 },
  req: { color: colour.danger },

  triple: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  tripleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colour.input,
    borderRadius: radius.md,
    paddingVertical: space(2.5),
    alignItems: 'center',
    backgroundColor: colour.surface,
  },
  tripleOn: { borderColor: colour.green, backgroundColor: colour.greenTint },
  tripleText: { fontSize: type.small, fontWeight: '700', color: colour.muted },
  tripleTextOn: { color: colour.green },

  upload: {
    borderWidth: 1,
    borderColor: colour.blueLine,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: space(3),
    alignItems: 'center',
    marginTop: space(2),
    backgroundColor: colour.blueTint,
  },
  uploadText: { fontSize: type.small, fontWeight: '700', color: colour.blue },
  uploaded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space(2),
    padding: space(2.5),
    borderRadius: radius.md,
    backgroundColor: colour.greenTint,
  },
  uploadedText: { fontSize: type.small, fontWeight: '600', color: colour.green },
  replace: { fontSize: type.tiny, fontWeight: '700', color: colour.blue },

  footer: { flexDirection: 'row', gap: space(2), marginTop: space(4) },
  draft: { marginTop: space(2) },

  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space(2.5),
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
  },
  reviewLabel: { fontSize: type.small, color: colour.body },
  reviewValue: { fontSize: type.small, fontWeight: '700', color: colour.text },
  declaration: { fontSize: type.tiny, color: colour.muted, marginTop: space(3), lineHeight: 18 },
});
