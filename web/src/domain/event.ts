export interface Event {
  id: number;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  mode: string;
  scoring:  { [key: string]: number };
  hours: number;
  desc: string;
  seed: string;
  prizes: { [key: string]: string };
  createdBy: string;
  updatedBy: string;
  updatedAt: Date;
}

export enum EventStatus {
  Draft = 0,
  New = 10,
  Live = 20,
  Over = 30,
  Old = 50,
  Deleted = 60
}

export interface PlayerLog {
  code: string;
  at: Date;
}

export interface Player {
  eventId: number;
  userId: number;
  name: string;
  avatarUrl: string;
  stream: string;
  status: PlayerStatus;
  score: number;
  updatedAt: Date;
  logs: PlayerLog[];
}

export enum PlayerStatus {
  Normal = 0,
  Disqualified = 10
}

export interface EventRow {
  id: number;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  players: EventRowPlayer[];
}

export interface EventRowPlayer {
  id: number;
  name: string;
  avatarUrl: string;
  score: number;
}