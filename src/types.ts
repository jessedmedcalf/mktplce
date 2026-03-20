export type Direction = "north" | "south" | "east" | "west";

export type ScoreAdjustment =
  | {
      type: "keywordBonus";
      keywords: string[];
      points: number;
      reason: string;
    }
  | {
      type: "keywordPenalty";
      keywords: string[];
      points: number;
      reason: string;
    }
  | {
      type: "priceThresholdBonus";
      atOrBelow: number;
      points: number;
      reason: string;
    }
  | {
      type: "priceThresholdPenalty";
      above: number;
      points: number;
      reason: string;
    };

export interface GlobalConfig {
  marketplace: {
    regionSlug: string;
    storageStatePath: string;
  };
  search: {
    origin: {
      label: string;
      latitude: number;
      longitude: number;
    };
    baseRadiusKm: number;
    directionalExtensionsKm?: Partial<Record<Direction, number>>;
    maxListingAgeDays: number;
    scrollRounds: number;
    maxListingsToInspect: number;
    delayMsBetweenSearches: number;
    delayMsBetweenListings: number;
  };
  sharedCriteria: {
    blockedTerms: string[];
    adjustments: ScoreAdjustment[];
  };
  reporting: {
    exceptionalScoreThreshold: number;
    goodScoreThreshold: number;
    outputDir: string;
  };
}

export interface ProductConfig {
  id: string;
  enabled: boolean;
  label: string;
  search: {
    query: string;
    minPrice?: number;
    maxPrice?: number;
  };
  criteria: {
    excellentPrice: number;
    goodPrice: number;
    ceilingPrice: number;
    requiredTermsAny?: string[];
    blockedTerms?: string[];
    adjustments?: ScoreAdjustment[];
  };
  notes?: string;
}

export interface SearchZone {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface CandidateCard {
  url: string;
  previewText: string;
}

export interface ListingSnapshot {
  url: string;
  title: string;
  meta: Record<string, string>;
  bodyText: string;
  previewText: string;
}

export interface ListingRecord {
  id: string;
  url: string;
  title: string;
  price: number | null;
  description: string;
  bodyText: string;
}

export interface ListingScore {
  score: number;
  classification: "exceptional" | "good" | "watch" | "pass";
  reasons: string[];
  blocked: boolean;
}

export interface AgentRunResult {
  agentId: string;
  label: string;
  query: string;
  generatedAt: string;
  notes?: string;
  listings: Array<{
    listing: ListingRecord;
    score: ListingScore;
  }>;
}
