import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ApplicantDocument,
  AwarenessProgram,
  OtpSent,
  RegistrationDraft,
  RegistrationResult,
} from './registration.models';

/**
 * The public registration API.
 *
 * Deliberately its own client rather than a section of ApiService: every call
 * here is anonymous, and ApiService's requests go through the auth interceptor
 * that attaches the admin bearer token. An applicant has no token, and an
 * administrator who happens to be signed in must not have theirs sent to a
 * public endpoint.
 */
@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/registration`;

  awarenessPrograms(): Observable<AwarenessProgram[]> {
    return this.http.get<AwarenessProgram[]>(`${this.base}/awareness-programs`);
  }

  /** The guides shown on R1, from Documents' MSME Enterprise audience. */
  applicantDocuments(): Observable<ApplicantDocument[]> {
    return this.http.get<ApplicantDocument[]>(`${this.base}/applicant-documents`);
  }

  verifyUdyam(body: {
    udyamRegistrationNo: string;
    mobile: string;
    authorised: boolean;
  }): Observable<RegistrationDraft> {
    return this.http.post<RegistrationDraft>(`${this.base}/verify-udyam`, body);
  }

  resume(token: string): Observable<RegistrationDraft> {
    return this.http.get<RegistrationDraft>(`${this.base}/${token}`);
  }

  saveUnit(
    token: string,
    body: { plantIdNo: string | null; unitIdNo: string; nicFiveDigit: string },
  ): Observable<void> {
    return this.http.put<void>(`${this.base}/${token}/unit`, body);
  }

  saveSpoc(
    token: string,
    body: {
      fullName: string;
      designation: string;
      mobile: string;
      email: string;
      attendedAwareness: boolean;
      awarenessProgramId: number | null;
    },
  ): Observable<void> {
    return this.http.put<void>(`${this.base}/${token}/spoc`, body);
  }

  sendOtp(token: string): Observable<OtpSent> {
    return this.http.post<OtpSent>(`${this.base}/${token}/otp`, {});
  }

  verifyOtp(token: string, otp: string): Observable<{ verified: boolean }> {
    return this.http.post<{ verified: boolean }>(`${this.base}/${token}/otp/verify`, { otp });
  }

  complete(token: string): Observable<RegistrationResult> {
    return this.http.post<RegistrationResult>(`${this.base}/${token}/complete`, {
      acceptPledge: true,
    });
  }
}
