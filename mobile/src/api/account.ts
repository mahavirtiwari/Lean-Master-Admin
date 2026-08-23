import { API_BASE_URL } from '../config';
import { request } from './client';

export interface Profile {
  enterprise: {
    name: string;
    leanId: string;
    udyamRegistrationNo: string;
    ownerName: string | null;
    gender: string | null;
    socialCategory: string | null;
    addressLine: string | null;
    pan: string | null;
    registeredOn: string;
    enterpriseSize: string;
    organisationType: string | null;
    activity: string | null;
    totalEmployees: number | null;
  };
  spoc: {
    name: string | null;
    designation: string | null;
    email: string | null;
    mobile: string | null;
  };
}

export interface LibraryDoc {
  documentId: number;
  title: string;
  description: string | null;
  fileName: string | null;
  kind: 'video' | 'document';
  url: string;
}

export interface AppNotification {
  title: string;
  detail: string;
  onUtc: string;
  kind: string;
}

export const profile = () => request<Profile>('/api/msme/profile');
export const library = () => request<LibraryDoc[]>('/api/msme/documents');
export const notifications = () => request<AppNotification[]>('/api/msme/notifications');

/** A document/video URL is relative to the API, so callers open it fully qualified. */
export const absoluteUrl = (url: string): string => (url.startsWith('http') ? url : `${API_BASE_URL}${url}`);
