import type {
  GlobalConfig,
  ListingRecord,
  ListingScore,
  ProductConfig,
  ScoreAdjustment
} from "./types.js";

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function containsPositiveAny(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    const normalizedTerm = term.toLowerCase();
    let index = text.indexOf(normalizedTerm);

    while (index !== -1) {
      const prefix = text.slice(Math.max(0, index - 16), index);

      if (!/\b(?:no|not|without|missing)\s*$/.test(prefix)) {
        return true;
      }

      index = text.indexOf(normalizedTerm, index + normalizedTerm.length);
    }

    return false;
  });
}

function calculateBasePriceScore(price: number | null, criteria: ProductConfig["criteria"]): { score: number; reason: string } {
  if (price == null) {
    return {
      score: 20,
      reason: "Price could not be parsed"
    };
  }

  if (price <= criteria.excellentPrice) {
    return {
      score: 78,
      reason: `Price is at or below the exceptional target ($${criteria.excellentPrice})`
    };
  }

  if (price <= criteria.goodPrice) {
    const ratio = (price - criteria.excellentPrice) / Math.max(criteria.goodPrice - criteria.excellentPrice, 1);
    const score = Math.round(78 - ratio * 13);
    return {
      score,
      reason: `Price is inside the good range (<= $${criteria.goodPrice})`
    };
  }

  if (price <= criteria.ceilingPrice) {
    const ratio = (price - criteria.goodPrice) / Math.max(criteria.ceilingPrice - criteria.goodPrice, 1);
    const score = Math.round(64 - ratio * 29);
    return {
      score,
      reason: `Price is above the target but still under the ceiling ($${criteria.ceilingPrice})`
    };
  }

  const overrun = price - criteria.ceilingPrice;
  return {
    score: Math.max(0, 20 - Math.round(overrun / 10) * 2),
    reason: `Price is above the ceiling by $${overrun}`
  };
}

function applyAdjustment(text: string, price: number | null, adjustment: ScoreAdjustment): { delta: number; reason?: string } {
  switch (adjustment.type) {
    case "keywordBonus":
    case "keywordPenalty": {
      const matched =
        adjustment.type === "keywordBonus"
          ? containsPositiveAny(text, adjustment.keywords)
          : containsAny(text, adjustment.keywords);

      if (!matched) {
        return { delta: 0 };
      }

      return {
        delta: adjustment.points,
        reason: adjustment.reason
      };
    }
    case "priceThresholdBonus": {
      if (price == null || price > adjustment.atOrBelow) {
        return { delta: 0 };
      }

      return {
        delta: adjustment.points,
        reason: adjustment.reason
      };
    }
    case "priceThresholdPenalty": {
      if (price == null || price <= adjustment.above) {
        return { delta: 0 };
      }

      return {
        delta: adjustment.points,
        reason: adjustment.reason
      };
    }
  }
}

function classifyScore(score: number, globalConfig: GlobalConfig): ListingScore["classification"] {
  if (score >= globalConfig.reporting.exceptionalScoreThreshold) {
    return "exceptional";
  }

  if (score >= globalConfig.reporting.goodScoreThreshold) {
    return "good";
  }

  if (score >= 50) {
    return "watch";
  }

  return "pass";
}

export function evaluateListing(
  listing: ListingRecord,
  productConfig: ProductConfig,
  globalConfig: GlobalConfig
): ListingScore {
  const searchableText = `${listing.title}\n${listing.description}\n${listing.bodyText}`.toLowerCase();
  const reasons: string[] = [];

  const base = calculateBasePriceScore(listing.price, productConfig.criteria);
  let score = base.score;
  reasons.push(base.reason);

  const sharedBlocked = globalConfig.sharedCriteria.blockedTerms ?? [];
  const productBlocked = productConfig.criteria.blockedTerms ?? [];
  const allBlockedTerms = [...sharedBlocked, ...productBlocked];

  if (allBlockedTerms.length > 0 && containsAny(searchableText, allBlockedTerms)) {
    score = Math.min(score, 15);
    reasons.push("Blocked term detected in the listing");
  }

  const requiredTermsAny = productConfig.criteria.requiredTermsAny ?? [];
  let blocked = false;

  if (requiredTermsAny.length > 0 && !containsAny(searchableText, requiredTermsAny)) {
    blocked = true;
    score = Math.min(score, 25);
    reasons.push(`Missing required product clues: ${requiredTermsAny.join(", ")}`);
  }

  const allAdjustments = [
    ...globalConfig.sharedCriteria.adjustments,
    ...(productConfig.criteria.adjustments ?? [])
  ];

  for (const adjustment of allAdjustments) {
    const result = applyAdjustment(searchableText, listing.price, adjustment);

    if (result.delta !== 0) {
      score += result.delta;
      if (result.reason) {
        reasons.push(result.reason);
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    classification: blocked ? "pass" : classifyScore(score, globalConfig),
    reasons,
    blocked
  };
}
