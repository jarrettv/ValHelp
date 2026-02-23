export type RunRecord = {
  world: boolean;
  personal: boolean;
  status: -1 | 0 | 1; // -1=Rejected, 0=Unverified, 1=Verified
  recordFrom: string | null;
  recordTo: string | null;
  verifiedAt: string | null;
  verifierId: number | null;
};

export type RunEvent = {
  time: number; // seconds from start
  kind: 'item' | 'station';
  label: string;
  code?: string;
  type?: string;
};

export type RunRow = {
  id: number;
  name: string;
  category: string;
  durationSeconds: number;
  record: RunRecord;
  updatedAt: string;
};

export type RunDetails = {
  id: number;
  name: string;
  category: string;
  durationSeconds: number;
  events: RunEvent[];
  record: RunRecord;
  createdAt: string;
  updatedAt: string;
};

export type RunUpsert = {
  name: string;
  category: string;
  durationSeconds: number;
  events: RunEvent[];
};
