export interface Event {
  id: number;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  mode: string;
  scoringCode: string;
  scoring:  { [key: string]: number };
  hours: number;
  desc: string;
  seed: string;
  prizes: { [key: string]: string };
  createdBy: string;
  updatedBy: string;
  updatedAt: Date;
  players: Player[];
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
  PlayerOut = -2,
  OwnerOut = -1,
  PlayerIn = 0,
  OwnerIn = 1,
  Disqualified = -10
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


export function GetEventState(ev: Event) {
  if (ev.status === EventStatus.Draft) return "draft";

  const random = ev.seed === "(random)";
  const soon = (new Date(ev.startAt).getTime() - new Date().getTime()) < 1000 * 60 * 60;
  const lessThan5m = (new Date(ev.startAt).getTime() - new Date().getTime()) < 1000 * 60 * 5;
  const started = new Date().getTime() > new Date(ev.startAt).getTime();

  if (ev.status === EventStatus.New && started && !random) return "start";
  if (ev.status === EventStatus.New && lessThan5m && !random) return "seed";
  if (ev.status === EventStatus.New && lessThan5m && random) return "roll";
  if (ev.status === EventStatus.New && soon && random) return "rand";
  if (ev.status === EventStatus.New && soon) return "soon";
  if (ev.status === EventStatus.New) return "wait";

  if (ev.status === EventStatus.Live) return "live";
  if (ev.status === EventStatus.Over) return "over";

  return "old";
}