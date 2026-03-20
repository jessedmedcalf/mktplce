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
      label: "Sydney CBD",
      latitude: -33.8688,
      longitude: 151.2093
    },
    baseRadiusKm: 25,
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

test("builds one base zone plus one zone per directional extension", () => {
  const zones = buildSearchZones(globalConfig);

  assert.equal(zones.length, 3);

  const base = zones.find((zone) => zone.id === "base");
  const west = zones.find((zone) => zone.id === "west");

  assert.ok(base);
  assert.ok(west);
  assert.equal(base?.radiusKm, 25);
  assert.equal(west?.radiusKm, 30);
  assert.ok((west?.longitude ?? 999) < globalConfig.search.origin.longitude);
});
