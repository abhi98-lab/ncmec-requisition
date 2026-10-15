export interface RegisterRecord {
  serial: number;
  reportNo: string;
  rawMobiles: string;
  mobiles: string[];
  sdr: string;
  extractedName: string;
  extractedAddress: string;
  ps: string;
  incidentDate: string;
}

export interface Notice179Config {
  startingMemoNo: string;
  memoYearSuffix: string;
  date: string;
  gdeNo: string;
  gdeDate: string;
  ioName: string;
  ioMobile: string;
  psAuthority: string;
  // Per-record manual overrides in case user edits extracted SDR in preview
  manualOverrides?: Record<number, {
    memoNo?: string;
    name?: string;
    address?: string;
    ps?: string;
  }>;
}

export type RequisitionType =
  | 'CAF'
  | 'CDR'
  | 'SDR'
  | 'CAF + CDR'
  | 'CAF + SDR'
  | 'CDR + SDR'
  | 'CAF + CDR + SDR';

export const FIXED_CASE_GIST =
  'As per the referred Cyber NCMEC Tipline Report, the following mobile number(s) have been found relevant to the reported matter. The requested data is required for verification and identification of the suspected person(s) and for further enquiry.';

export interface RequisitionConfig {
  requisitionType: RequisitionType;
  psName: string;
  gdeNo: string;
  gdeDate: string;
  fromDate: string;
  toDate: string;
  ioName: string;
  caseGist: string;
}

export interface GeneratedDoc {
  id: string;
  filename: string;
  blob: Blob;
  type: '179' | 'REQUISITION';
  recordSerial?: number;
  reportNo?: string;
  recordCount?: number;
  createdAt: Date;
}
