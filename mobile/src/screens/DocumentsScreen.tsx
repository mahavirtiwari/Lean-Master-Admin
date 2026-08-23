import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { absoluteUrl, library, type LibraryDoc } from '../api/account';
import { AppShell } from '../components/AppShell';
import { Card } from '../components/ui';
import { colour, radius, space, type } from '../theme/theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Documents'>;

/**
 * The document library (D01): the files and videos the Ministry publishes to
 * MSMEs, split into the two kinds. Tapping a file streams it; tapping a video
 * opens where it is hosted.
 */
export default function DocumentsScreen(_: Props): React.JSX.Element {
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);

  useEffect(() => {
    void (async () => setDocs(await library().catch(() => [])))();
  }, []);

  const files = (docs ?? []).filter((d) => d.kind === 'document');
  const videos = (docs ?? []).filter((d) => d.kind === 'video');

  return (
    <AppShell title="Documents" canGoBack>
      {docs && docs.length === 0 ? (
        <Card capped>
          <Text style={styles.emptyTitle}>Nothing published yet</Text>
          <Text style={styles.emptyText}>Guides and videos from the Ministry will appear here.</Text>
        </Card>
      ) : null}

      {files.length ? (
        <>
          <Text style={styles.heading}>Guides & documents</Text>
          {files.map((d) => (
            <DocRow key={d.documentId} doc={d} />
          ))}
        </>
      ) : null}

      {videos.length ? (
        <>
          <Text style={styles.heading}>Videos</Text>
          {videos.map((d) => (
            <DocRow key={d.documentId} doc={d} />
          ))}
        </>
      ) : null}
    </AppShell>
  );
}

function DocRow({ doc }: { doc: LibraryDoc }): React.JSX.Element {
  const isVideo = doc.kind === 'video';
  return (
    <Pressable onPress={() => void Linking.openURL(absoluteUrl(doc.url))}>
      <Card style={styles.row}>
        <View style={[styles.icon, isVideo ? styles.iconVideo : null]}>
          <Text style={styles.iconText}>{isVideo ? '▶' : 'PDF'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{doc.title}</Text>
          {doc.description ? <Text style={styles.desc} numberOfLines={2}>{doc.description}</Text> : null}
        </View>
        <Text style={styles.chevron}>{isVideo ? '↗' : '↓'}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: {
    fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.4, color: colour.muted,
    textTransform: 'uppercase', marginTop: space(4), marginBottom: space(2),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) },
  icon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colour.dangerTint,
    alignItems: 'center', justifyContent: 'center',
  },
  iconVideo: { backgroundColor: colour.blueTint },
  iconText: { fontSize: type.tiny, fontWeight: '800', color: colour.danger },
  title: { fontSize: type.small, fontWeight: '700', color: colour.text },
  desc: { fontSize: type.tiny, color: colour.muted, marginTop: 1 },
  chevron: { fontSize: type.body, color: colour.placeholder },
  emptyTitle: { fontSize: type.section, fontWeight: '700', color: colour.text },
  emptyText: { fontSize: type.small, color: colour.body, marginTop: space(1), lineHeight: 20 },
});
