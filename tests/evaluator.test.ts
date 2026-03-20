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
      label: "Alexandria NSW 2015",
      latitude: -33.9105,
      longitude: 151.1994
    },
    radiusTiers: [
      {
        id: "local",
        label: "Local ring",
        radiusKm: 8
      },
      {
        id: "extended",
        label: "Extended ring",
        radiusKm: 15,
        scoreAdjustmentPoints: -18,
        minimumClassification: "exceptional"
      }
    ],
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
      },
      {
        type: "priceThresholdBonus",
        atOrBelow: 49,
        points: 8,
        reason: "Under $50 leaves room to replace the controller"
      }
    ]
  },
  notes: "Under $60 with controller is exceptional. Under $50 without a controller is acceptable locally, but the extended ring only keeps exceptional deals."
};

test("scores a low-priced PS4 with controller as exceptional", () => {
  const listing: ListingRecord = {
    id: "1",
    url: "https://www.facebook.com/marketplace/item/1",
    title: "PS4 slim with controller",
    price: 55,
    description: "Works perfectly and comes with one controller.",
    bodyText: "Works perfectly and comes with one controller.",
    searchContext: {
      tierId: "local",
      tierLabel: "Local ring",
      zoneId: "local:base",
      zoneLabel: "Alexandria NSW 2015 (Local ring)",
      radiusKm: 8,
      scoreAdjustmentPoints: 0,
      discoveredInZones: ["Alexandria NSW 2015 (Local ring)"]
    }
  };

  const score = evaluateListing(listing, productConfig, globalConfig);

  assert.equal(score.classification, "exceptional");
  assert.equal(score.blocked, false);
  assert.ok(score.score >= 85);
});

test("treats a cheap PS4 without controller as acceptable inside the local ring", () => {
  const listing: ListingRecord = {
    id: "2",
    url: "https://www.facebook.com/marketplace/item/2",
    title: "PS4 console only",
    price: 49,
    description: "PS4 works fine, no controller included.",
    bodyText: "PS4 works fine, no controller included.",
    searchContext: {
      tierId: "local",
      tierLabel: "Local ring",
      zoneId: "local:base",
      zoneLabel: "Alexandria NSW 2015 (Local ring)",
      radiusKm: 8,
      scoreAdjustmentPoints: 0,
      discoveredInZones: ["Alexandria NSW 2015 (Local ring)"]
    }
  };

  const score = evaluateListing(listing, productConfig, globalConfig);

  assert.equal(score.classification, "good");
  assert.ok(score.score >= 70);
  assert.ok(score.score < 85);
});

test("drops extended-ring PS4 listings unless they are still exceptional after the distance penalty", () => {
  const listing: ListingRecord = {
    id: "3",
    url: "https://www.facebook.com/marketplace/item/3",
    title: "PS4 console only",
    price: 49,
    description: "PS4 works fine, no controller included.",
    bodyText: "PS4 works fine, no controller included.",
    searchContext: {
      tierId: "extended",
      tierLabel: "Extended ring",
      zoneId: "extended:base",
      zoneLabel: "Alexandria NSW 2015 (Extended ring)",
      radiusKm: 15,
      scoreAdjustmentPoints: -18,
      minimumClassification: "exceptional",
      discoveredInZones: ["Alexandria NSW 2015 (Extended ring)"]
    }
  };

  const score = evaluateListing(listing, productConfig, globalConfig);

  assert.equal(score.classification, "pass");
  assert.ok(score.reasons.some((reason) => reason.includes("only keeps exceptional deals")));
});
