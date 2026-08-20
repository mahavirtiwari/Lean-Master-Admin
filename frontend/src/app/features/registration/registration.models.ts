// Contracts for the public registration wizard. Separate from core/models.ts:
// these are the applicant's shapes, served by an anonymous controller, and
// nothing here should be reachable from the admin screens.

export interface AwarenessProgram {
  awarenessProgramId: number;
  /** Readable programme ID, e.g. LAP-27-202508-001. */
  programCode: string | null;
  name: string;
  heldOn: string | null;
  venue: string | null;
}

/** What Udyam holds about the enterprise (R3 — all read-only). */
export interface RegistrationEnterprise {
  udyamNumber: string;
  enterpriseName: string | null;
  ownerName: string | null;
  organisationType: string | null;
  gender: string | null;
  socialCategory: string | null;
  address: string | null;
  pincode: string | null;
  stateName: string | null;
  districtName: string | null;
  enterpriseType: string | null;
  majorActivity: string | null;
  totalEmployees: number | null;
  incorporationDate: string | null;
  commencementDate: string | null;
  appliedDate: string | null;
  pan: string | null;
}

export interface RegistrationPlant {
  /** Position in the Udyam response. Udyam can repeat or omit UnitIdNo, so the
   *  index — not the id — is what the screen selects by. */
  index: number;
  unitIdNo: string | null;
  unitName: string | null;
  address: string | null;
  pincode: string | null;
  state: string | null;
  district: string | null;
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
  /** False when the NIC division is not an active sector in master.Sector. */
  isEligible: boolean;
  sectorName: string | null;
}

export interface RegistrationDraft {
  /** Opaque handle for the draft; the only thing the browser holds. */
  sessionToken: string;
  currentStep: number;
  udyamRegistrationNo?: string;
  enterprise: RegistrationEnterprise | null;
  plants: RegistrationPlant[];
  activities: RegistrationActivity[];
  selectedUnitIdNo?: string | null;
  selectedNicFiveDigit?: string | null;
}

export interface OtpSent {
  sentTo: string;
  validForMinutes: number;
}

export interface RegistrationResult {
  leanId: string;
  enterpriseId: number;
  enterpriseName: string;
  spocEmail: string;
  message: string;
}

/** A guide offered on R1, maintained in the admin module's Documents screen. */
export interface ApplicantDocument {
  documentId: number;
  title: string;
  description: string | null;
  versionId: number;
  fileName: string;
  /** "video" when the stored file is a video, "document" otherwise. */
  kind: 'video' | 'document';
  url: string;
}
