import type { Direction, GlobalConfig, SearchZone } from "./types.js";

const EARTH_RADIUS_KM = 6371;

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function bearingForDirection(direction: Direction): number {
  switch (direction) {
    case "north":
      return 0;
    case "east":
      return 90;
    case "south":
      return 180;
    case "west":
      return 270;
  }
}

function destinationPoint(
  latitude: number,
  longitude: number,
  bearingDegrees: number,
  distanceKm: number
): { latitude: number; longitude: number } {
  const bearing = degreesToRadians(bearingDegrees);
  const lat1 = degreesToRadians(latitude);
  const lon1 = degreesToRadians(longitude);
  const angularDistance = distanceKm / EARTH_RADIUS_KM;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: Number(radiansToDegrees(lat2).toFixed(6)),
    longitude: Number(radiansToDegrees(lon2).toFixed(6))
  };
}

export function buildSearchZones(globalConfig: GlobalConfig): SearchZone[] {
  const {
    latitude,
    longitude,
    label
  } = globalConfig.search.origin;

  const zones: SearchZone[] = [];
  const directionalExtensions = globalConfig.search.directionalExtensionsKm ?? {};

  for (const [priorityRank, tier] of globalConfig.search.radiusTiers.entries()) {
    zones.push({
      id: `${tier.id}:base`,
      label: `${label} (${tier.label})`,
      latitude,
      longitude,
      radiusKm: tier.radiusKm,
      tierId: tier.id,
      tierLabel: tier.label,
      priorityRank,
      scoreAdjustmentPoints: tier.scoreAdjustmentPoints ?? 0,
      minimumClassification: tier.minimumClassification
    });

    for (const direction of Object.keys(directionalExtensions) as Direction[]) {
      const extensionKm = directionalExtensions[direction];

      if (!extensionKm || extensionKm <= 0) {
        continue;
      }

      const shifted = destinationPoint(latitude, longitude, bearingForDirection(direction), extensionKm / 2);

      zones.push({
        id: `${tier.id}:${direction}`,
        label: `${label} + ${direction} (${tier.label})`,
        latitude: shifted.latitude,
        longitude: shifted.longitude,
        radiusKm: tier.radiusKm + extensionKm / 2,
        tierId: tier.id,
        tierLabel: tier.label,
        priorityRank,
        scoreAdjustmentPoints: tier.scoreAdjustmentPoints ?? 0,
        minimumClassification: tier.minimumClassification
      });
    }
  }

  return zones;
}
