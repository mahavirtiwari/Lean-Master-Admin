import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { ApiError, OfflineError, getBearer } from './client';
import { API_BASE_URL, APP_VERSION } from '../config';

/**
 * The LEAN pledge certificate.
 *
 * The server renders it on request and streams it back — no copy is kept there
 * or here beyond the moment of handing it over, so the certificate always
 * carries the details the registration holds now.
 *
 * This is the one part of the registration that cannot work offline: the
 * document is drawn from the server's record, not from the draft on the
 * device. Asking for it without a connection raises OfflineError, which every
 * screen already knows how to phrase.
 */

/** Downloads the certificate for a registration in progress (R8 and R9). */
export function downloadDraftPledge(token: string, fileName: string): Promise<void> {
  return download(`/api/registration/${token}/pledge`, fileName, true);
}

/** Downloads the certificate for the signed-in enterprise (dashboard). */
export function downloadMyPledge(fileName: string): Promise<void> {
  return download('/api/msme/pledge', fileName, false);
}

async function download(path: string, fileName: string, anonymous: boolean): Promise<void> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = { 'X-Client-Platform': `${Platform.OS}/${APP_VERSION}` };
  const bearer = getBearer();

  if (!anonymous && bearer) headers.Authorization = `Bearer ${bearer}`;

  if (Platform.OS === 'web') return downloadOnWeb(url, headers, fileName);

  // The cache directory, not documents: the certificate is handed straight to
  // whatever the applicant chooses to keep it in, and leaving copies in the
  // app's own storage would be the "stored on the server" problem moved one
  // step along.
  const target = new File(Paths.cache, fileName);

  if (target.exists) target.delete();

  let saved: File;

  try {
    saved = await File.downloadFileAsync(url, target, { headers });
  } catch {
    throw new OfflineError('The certificate could not be downloaded. Check your connection.');
  }

  // A refused request can still land as a file — the error body written to
  // disk. A certificate is a few hundred kilobytes, so anything tiny is the
  // refusal, not the document.
  if (!saved.exists || saved.size < 5_000) {
    if (saved.exists) saved.delete();

    throw new ApiError(500, 'The certificate could not be prepared. Please try again.');
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(saved.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'LEAN Pledge certificate',
    });
  }
}

/**
 * The browser preview of the app, where there is no filesystem to write to and
 * no share sheet. Kept working so the screens can be reviewed on a desktop.
 */
async function downloadOnWeb(
  url: string,
  headers: Record<string, string>,
  fileName: string,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(url, { headers });
  } catch {
    throw new OfflineError('The certificate could not be downloaded. Check your connection.');
  }

  if (!response.ok) {
    throw new ApiError(response.status, 'The certificate could not be prepared. Please try again.');
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(objectUrl);
}

/** The file name a certificate is offered under. */
export function pledgeFileName(udyamNumber: string | undefined): string {
  const suffix = (udyamNumber ?? '').replace(/[^A-Za-z0-9-]/g, '') || 'certificate';

  return `lean-pledge-${suffix}.pdf`;
}
