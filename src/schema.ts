import { z } from "zod";

const classificationSchema = z.enum(["exceptional", "good", "watch", "pass"]);

const scoreAdjustmentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("keywordBonus"),
    keywords: z.array(z.string().min(1)).min(1),
    points: z.number(),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal("keywordPenalty"),
    keywords: z.array(z.string().min(1)).min(1),
    points: z.number(),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal("priceThresholdBonus"),
    atOrBelow: z.number(),
    points: z.number(),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal("priceThresholdPenalty"),
    above: z.number(),
    points: z.number(),
    reason: z.string().min(1)
  })
]);

export const globalConfigSchema = z.object({
  marketplace: z.object({
    regionSlug: z.string().min(1),
    storageStatePath: z.string().min(1)
  }),
  search: z.object({
    origin: z.object({
      label: z.string().min(1),
      latitude: z.number(),
      longitude: z.number()
    }),
    radiusTiers: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          radiusKm: z.number().positive(),
          scoreAdjustmentPoints: z.number().optional(),
          minimumClassification: classificationSchema.optional()
        })
      )
      .min(1),
    directionalExtensionsKm: z
      .object({
        north: z.number().nonnegative().optional(),
        south: z.number().nonnegative().optional(),
        east: z.number().nonnegative().optional(),
        west: z.number().nonnegative().optional()
      })
      .optional(),
    maxListingAgeDays: z.number().int().positive(),
    scrollRounds: z.number().int().positive(),
    maxListingsToInspect: z.number().int().positive(),
    delayMsBetweenSearches: z.number().int().nonnegative(),
    delayMsBetweenListings: z.number().int().nonnegative()
  }),
  sharedCriteria: z.object({
    blockedTerms: z.array(z.string()),
    adjustments: z.array(scoreAdjustmentSchema)
  }),
  reporting: z.object({
    exceptionalScoreThreshold: z.number().min(0).max(100),
    goodScoreThreshold: z.number().min(0).max(100),
    outputDir: z.string().min(1)
  })
});

export const productConfigSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  label: z.string().min(1),
  search: z.object({
    query: z.string().min(1),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional()
  }),
  criteria: z.object({
    excellentPrice: z.number().nonnegative(),
    goodPrice: z.number().nonnegative(),
    ceilingPrice: z.number().nonnegative(),
    requiredTermsAny: z.array(z.string()).optional(),
    blockedTerms: z.array(z.string()).optional(),
    adjustments: z.array(scoreAdjustmentSchema).optional()
  }),
  notes: z.string().optional()
});
