import test from "node:test";
import assert from "node:assert/strict";

import { evaluateListing } from "../src/evaluator.js";
import type { GlobalConfig, ListingRecord, ProductConfig } from "../src/types.js";

const globalConfig: GlobalConfig = {
  marketplace: {
    regionSlug: "sydney",
    storageStatePath: "auth/facebook-marketplace.json"
  },
  search: {
    origin: {
      label: "Sydney CBD",
      latitude: -33.8688,
      longitude: 151.2093
    },
    baseRadiusKm: 25,
    directionalExtensionsKm: {
      west: 10
    },
    maxListingAgeDays: 7,
    scrollRounds: 3,
    maxListingsToInspect: 10,
    delayMsBetweenSearches: 100,
    delayMsBetweenListings: 100
  },
  sharedCriteria: {
    blockedTerms: ["broken"],
    adjustments: [
      {
        type: "keywordPenalty",
        keywords: ["broken"],
        points: -40,
        reason: "High risk condition language"
      }
    ]
  },
  reporting: {
    exceptionalScoreThreshold: 85,
    goodScoreThreshold: 70,
    outputDir: "out"
  }
};

const productConfig: ProductConfig = {
  id: "playstation-4",
  enabled: true,
  label: "PlayStation 4",
  search: {
    query: "PlayStation 4",
    maxPrice: 140
  },
  criteria: {
    excellentPrice: 60,
    goodPrice: 85,
    ceilingPrice: 120,
    adjustments: [
      {
        type: "keywordBonus",
        keywords: [
          "with controller",
          "comes with controller",
          "controller included",
          "includes controller",
          "with controllers",
          "controllers included"
        ],
        points: 18,
        reason: "Controller included"
      },
      {
        type: "keywordPenalty",
        keywords: ["no controller", "without controller"],
        points: -10,
        reason: "Replacement controller cost eats into the deal"
      }
    ]
  },
  notes: "Under $60 with controller is exceptional. Under $50 without controllers can still be worth a look."
};

test("scores a low-priced PS4 with controller as exceptional", () => {
  const listing: ListingRecord = {
    id: "1",
    url: "https://www.facebook.com/marketplace/item/1",
    title: "PS4 slim with controller",
    price: 55,
    description: "Works perfectly and comes with one controller.",
    bodyText: "Works perfectly and comes with one controller."
  };

  const score = evaluateListing(listing, productConfig, globalConfig);

  assert.equal(score.classification, "exceptional");
  assert.equal(score.blocked, false);
  assert.ok(score.score >= 85);
});

test("keeps a cheap PS4 without controller on the radar instead of marking it exceptional", () => {
  const listing: ListingRecord = {
    id: "2",
    url: "https://www.facebook.com/marketplace/item/2",
    title: "PS4 console only",
    price: 49,
    description: "PS4 works fine, no controller included.",
    bodyText: "PS4 works fine, no controller included."
  };

  const score = evaluateListing(listing, productConfig, globalConfig);

  assert.equal(score.classification, "watch");
  assert.ok(score.score < 85);
});
