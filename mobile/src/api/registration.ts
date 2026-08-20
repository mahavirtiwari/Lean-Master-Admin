import { cachedGet, request } from './client';
import { enqueue } from '../offline/db';

// ------------------------------------------------------------------ types ---

export interface AwarenessProgram {
  awarenessProgramId: number;
  programCode: string | null;
  name: string;
  heldOn: string | null;
  venue: string | null;
}

export interface ApplicantDocument {
  documentId: number;
  title: string;
  description: string | null;
  versionId: number;
  fileName: string;
  kind: 'video' | 'document';
  url: string;
}

export interface RegistrationPlant {
  index: number;
  unitIdNo: string | null;
  /**
   * The registry's own plant id, and the only thing that tells two units of one
   * enterprise apart — UnitIdNo is repeated across them.
   */
  plantIdNo: string | null;
  unitName: string | null;
  address: string | null;
  pincode: string | null;
  state: string | null;
  district: string | null;
  isRegistered: boolean;
  registeredLeanId: string | null;
}

export interface RegistrationActivity {
  index: number;
  activity: string | null;
  nicTwoDigit: string | null;
  nicTwoDigitName: string | null;
  nicFourDigit: string | null;
  nicFourDigitName: string | null;
  nicFiveDigit: string | null;
  nicFiveDigitName: string | null;
  isEligible: boolean;
  sectorName: string | null;
}

export interface RegistrationEnterprise {
  udyamNumber: string;
  enterpriseName: string | null;
  ownerName: string | null;
  organisationType: string | null;
  enterpriseType: string | null;
  majorActivity: string | null;
  state: string | null;
  district: string | null;
  pincode: string | null;
  address: string | null;
}

export interface RegistrationDraft {
  sessionToken: string;
  currentStep: number;
  enterprise: RegistrationEnterprise | null;
  plants: RegistrationPlant[] | null;
  activities: RegistrationActivity[] | null;
  selectedUnitIdNo: string | null;
  selectedNicFiveDigit: string | null;
  spoc: {
    name: string | null;
    designation: string | null;
    mobile: string | null;
    email: string | null;
    attendedAwareness: boolean | null;
    awarenessProgramId: number | null;
  } | null;
}

export interface RegistrationResult {
  leanId: string;
  enterpriseId: number;
  enterpriseName: string;
  spocEmail: string;
  message: string;
}

const base = '/api/registration';

// -------------------------------------------------------- reference data ---
// Cached, so the guide and the programme list are present with no signal.

export const awarenessPrograms = () =>
  cachedGet<AwarenessProgram[]>(`${base}/awareness-programs`, 'awareness-programs');

export const applicantDocuments = () =>
  cachedGet<ApplicantDocument[]>(`${base}/applicant-documents`, 'applicant-documents');

// ----------------------------------------------------------- the wizard ---
// Udyam validation and the OTP are the two steps that genuinely cannot work
// offline: one reads the Government registry, the other sends mail. The
// screens say so rather than queueing something that could never succeed.

export const verifyUdyam = (body: {
  udyamRegistrationNo: string;
  mobile: string;
  authorised: boolean;
}) => request<RegistrationDraft>(`${base}/verify-udyam`, { method: 'POST', anonymous: true, body });

export const loadDraft = (token: string) =>
  request<RegistrationDraft>(`${base}/${token}`, { anonymous: true });

export const saveUnit = (token: string, body: { plantIdNo: string | null; unitIdNo: string; nicFiveDigit: string }) =>
  request<void>(`${base}/${token}/unit`, { method: 'PUT', anonymous: true, body });

export const saveSpoc = (
  token: string,
  body: {
    fullName: string;
    designation: string;
    mobile: string;
    email: string;
    attendedAwareness: boolean;
    awarenessProgramId: number | null;
  },
) => request<void>(`${base}/${token}/spoc`, { method: 'PUT', anonymous: true, body });

export const sendOtp = (token: string) =>
  request<{ sentTo: string; validForMinutes: number }>(`${base}/${token}/otp`, {
    method: 'POST',
    anonymous: true,
  });

export const verifyOtp = (token: string, otp: string) =>
  request<void>(`${base}/${token}/otp/verify`, { method: 'POST', anonymous: true, body: { otp } });

// The server's field is acceptPledge, and it takes nothing else — the name on
// the pledge comes from the SPOC details already saved against the draft.
export const complete = (token: string, body: { acceptPledge: boolean }) =>
  request<RegistrationResult>(`${base}/${token}/complete`, {
    method: 'POST',
    anonymous: true,
    body,
  });

/**
 * Queues a step for later.
 *
 * Used by the steps that only record what was chosen — the unit and the SPOC.
 * They have no answer the screen needs, so the applicant can carry on and the
 * request lands when the connection does. Anything whose answer the next screen
 * depends on is never queued; see the note above.
 */
export const queueUnit = (token: string, body: { plantIdNo: string | null; unitIdNo: string; nicFiveDigit: string }) =>
  enqueue('PUT', `${base}/${token}/unit`, body);

export const queueSpoc = (
  token: string,
  body: {
    fullName: string;
    designation: string;
    mobile: string;
    email: string;
    attendedAwareness: boolean;
    awarenessProgramId: number | null;
  },
) => enqueue('PUT', `${base}/${token}/spoc`, body);
