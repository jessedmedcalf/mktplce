import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchZones } from "../src/geo.js";
import type { GlobalConfig } from "../src/types.js";

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
    directionalExtensionsKm: {
      west: 10,
      north: 4
    },
    maxListingAgeDays: 7,
    scrollRounds: 3,
    maxListingsToInspect: 10,
    delayMsBetweenSearches: 100,
    delayMsBetweenListings: 100
  },
  sharedCriteria: {
    blockedTerms: [],
    adjustments: []
  },
  reporting: {
    exceptionalScoreThreshold: 85,
    goodScoreThreshold: 70,
    outputDir: "out"
  }
};

test("builds one base zone plus one zone per directional extension for each radius tier", () => {
  const zones = buildSearchZones(globalConfig);

  assert.equal(zones.length, 6);

  const localBase = zones.find((zone) => zone.id === "local:base");
  const extendedWest = zones.find((zone) => zone.id === "extended:west");

  assert.ok(localBase);
  assert.ok(extendedWest);
  assert.equal(localBase?.radiusKm, 8);
  assert.equal(extendedWest?.radiusKm, 20);
  assert.equal(extendedWest?.tierId, "extended");
  assert.ok((extendedWest?.longitude ?? 999) < globalConfig.search.origin.longitude);
});
