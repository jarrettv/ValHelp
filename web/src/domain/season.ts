import { EventStatus } from "./event";

export interface SeasonListResponse {
  active: SeasonSummary[];
  archived: SeasonSummary[];
}

export interface SeasonSummary {
  code: string;
  name: string;
  pitch: string;
  mode: string;
  isActive: boolean;
  hours: number;
  schedule: SeasonSchedule;
  stats: SeasonStats;
  latestEvent: SeasonEventSummary | null;
  upcomingEvent: SeasonEventSummary | null;
  eventCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SeasonDetails extends SeasonSummary {
  desc: string;
  scoreItems: ScoreItem[];
  admins: SeasonAdmin[];
  events: SeasonEventSummary[];
  ownerUsername: string;
}

export interface SeasonSchedule {
  name: string;
  eventNameTemplate: string;
  seasonNum: number;
  eventNumInit: number;
  events: ScheduledEventItem[];
}

export interface ScheduledEventItem {
  eventNum: number;
  startAt: string;
  name: string;
  hours: number;
}

export interface SeasonStats {
  totalEvents: number;
  totalPlayers: number;
  uniquePlayers: number;
}

export interface SeasonEventSummary {
  id: number;
  name: string;
  startAt: string;
  endAt: string;
  status: EventStatus;
  mode: string;
  hours: number;
}

export interface SeasonAdmin {
  name: string;
  userId: number;
}

export interface ScoreItem {
  code: string;
  score: number;
  name: string;
  dropRate?: number | null;
  rarity?: string | null;
}
