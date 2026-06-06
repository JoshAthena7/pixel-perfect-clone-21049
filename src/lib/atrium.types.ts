export type AtriumContributor = {
  writerId: string;
  displayName: string;
  contributionCount: number;
};

export type AtriumWin = {
  missionId: string;
  missionName: string;
  client: string | null;
  state: string | null;
  awardedUsd: number;
  peopleServed: number;
  wonAt: string | null;
  contributors: AtriumContributor[];
};

export type AtriumActivity = {
  id: string;
  writerId: string;
  displayName: string;
  eventType: string;
  missionId: string | null;
  missionName: string | null;
  occurredAt: string;
};

export type AtriumLiveWriter = {
  writerId: string;
  displayName: string;
  lastSeen: string;
};

export type AtriumViewerCard = {
  displayName: string;
  wins: number;
  awardedUsd: number;
  states: number;
  peopleServed: number;
  streakDays: number;
};

export type AtriumPayload = {
  latestWin: AtriumWin | null;
  activity: AtriumActivity[];
  liveWriters: AtriumLiveWriter[];
  viewer: AtriumViewerCard | null;
  totals: { wins: number; awardedUsd: number; peopleServed: number; states: number };
};