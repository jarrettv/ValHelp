import { PlayerLog } from "./event";

export interface PlayerEvent {
    eventId: number;
    playerName: string;
    eventName: string;
    stream: string;
    startAt: string;
    endAt: string;
    playerStatus: number;
    eventStatus: number;
    mode: string;
    scoringCode: string;
    hours: number;
    seed: string;
    scores: number[];
    score: number;
    logs: PlayerLog[];
}

export interface UserPlayer {
    userId: number;
    username: string;
    avatarUrl: string;
    youtube: string;
    twitch: string;
    events: PlayerEvent[];
}