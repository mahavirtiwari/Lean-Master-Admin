import { request } from './client';

/** The active checklist the Silver application asks for (admin-defined). */
export interface ApplicationConfig {
  basicInfo: {
    basicInfoItemId: number;
    groupName: string;
    label: string;
    helpText: string | null;
    inputType: 'photo' | 'yesno' | 'text' | 'number' | 'checklist';
    isRequired: boolean;
  }[];
  esgSections: {
    esgSectionId: number;
    name: string;
    questions: {
      esgQuestionId: number;
      text: string;
      helpText: string | null;
      parentQuestionId: number | null;
      showWhenAnswer: 'Yes' | 'No' | null;
    }[];
  }[];
  documents: {
    documentRequirementId: number;
    name: string;
    helpText: string | null;
    acceptedTypes: string;
    isMandatory: boolean;
  }[];
}

export interface SilverSubmission {
  submissionId: number;
  status: 'Draft' | 'Submitted';
  submittedOnUtc: string | null;
  basicInfo: { basicInfoItemId: number; valueText: string | null }[];
  esg: { esgQuestionId: number; answer: 'Yes' | 'No' | 'NA' }[];
  documents: { documentRequirementId: number; originalFileName: string | null; uploadedOnUtc: string | null }[];
}

export interface SilverPayload {
  submit: boolean;
  basicInfo: { basicInfoItemId: number; value: string | null }[];
  esg: { esgQuestionId: number; answer: 'Yes' | 'No' | 'NA' }[];
  documents: { documentRequirementId: number; originalFileName: string | null }[];
}

export const applicationConfig = () =>
  request<ApplicationConfig>('/api/msme/application/config');

export const silverSubmission = () =>
  request<SilverSubmission | null>('/api/msme/application/silver');

export const saveSilver = (payload: SilverPayload) =>
  request<{ submissionId: number; status: string }>('/api/msme/application/silver', {
    method: 'POST',
    body: payload,
  });

// ------------------------------------------------------------------ payment ---

export interface SilverFee {
  gross: number;
  gstPercent: number;
  subsidyPercent: number;
  subsidyAmount: number;
  payable: number;
  currency: string;
}

export interface PaymentReceipt {
  reference: string;
  amount: number;
  method: string;
  paidOn: string;
}

export const silverFee = () => request<SilverFee>('/api/msme/application/silver/fee');

export const paySilver = (method: string, simulateFailure = false) =>
  request<PaymentReceipt>('/api/msme/application/silver/pay', {
    method: 'POST',
    body: { method, simulateFailure },
  });
