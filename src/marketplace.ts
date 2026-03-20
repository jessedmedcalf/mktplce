import { access } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

import { buildSearchZones } from "./geo.js";
import type {
  CandidateCard,
  GlobalConfig,
  ListingRecord,
  ListingSnapshot,
  ProductConfig,
  SearchZone
} from "./types.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeListingUrl(url: string): string {
  const clean = url.split("?")[0] ?? url;
  return clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function extractListingId(url: string): string {
  const match = url.match(/\/marketplace\/item\/(\d+)/);
  return match?.[1] ?? url;
}

function parsePriceFromText(text: string): number | null {
  const match = text.match(/\$ ?([0-9][0-9,]*)/);

  if (!match) {
    return null;
  }

  const amount = match[1];

  if (!amount) {
    return null;
  }

  return Number(amount.replaceAll(",", ""));
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*\|\s*Facebook.*$/i, "")
    .replace(/\s*\|\s*Marketplace.*$/i, "")
    .replace(/\s+-\s*Marketplace.*$/i, "")
    .trim();
}

function extractDescription(snapshot: ListingSnapshot): string {
  const ogDescription = snapshot.meta["og:description"];

  if (ogDescription && ogDescription.trim().length > 0) {
    return ogDescription.trim();
  }

  const body = snapshot.bodyText.replace(/\r/g, "");
  const sectionMatch = body.match(
    /Description\s+([\s\S]{0,1600}?)(?:Seller details|Condition|Location is approximate|Listed|Message seller|Send seller message|$)/i
  );

  if (sectionMatch?.[1]) {
    return sectionMatch[1].replace(/\n{2,}/g, "\n").trim();
  }

  return body.slice(0, 1000).trim();
}

type TrackedCandidate = CandidateCard & {
  searchZone: SearchZone;
  discoveredInZones: string[];
};

function parseListingRecord(snapshot: ListingSnapshot, candidate: TrackedCandidate): ListingRecord {
  const titleCandidate =
    snapshot.meta["og:title"] ??
    snapshot.meta["twitter:title"] ??
    snapshot.title;

  const title = cleanTitle(titleCandidate);
  const description = extractDescription(snapshot);
  const price =
    parsePriceFromText(snapshot.meta["product:price:amount"] ?? "") ??
    parsePriceFromText(title) ??
    parsePriceFromText(description) ??
    parsePriceFromText(snapshot.bodyText) ??
    parsePriceFromText(snapshot.previewText);

  return {
    id: extractListingId(snapshot.url),
    url: snapshot.url,
    title,
    price,
    description,
    bodyText: snapshot.bodyText,
    searchContext: {
      tierId: candidate.searchZone.tierId,
      tierLabel: candidate.searchZone.tierLabel,
      zoneId: candidate.searchZone.id,
      zoneLabel: candidate.searchZone.label,
      radiusKm: candidate.searchZone.radiusKm,
      scoreAdjustmentPoints: candidate.searchZone.scoreAdjustmentPoints,
      minimumClassification: candidate.searchZone.minimumClassification,
      discoveredInZones: candidate.discoveredInZones
    }
  };
}

function buildSearchUrl(globalConfig: GlobalConfig, productConfig: ProductConfig, zone: SearchZone): string {
  const url = new URL(`https://www.facebook.com/marketplace/${globalConfig.marketplace.regionSlug}/search`);

  url.searchParams.set("query", productConfig.search.query);
  url.searchParams.set("exact", "false");
  url.searchParams.set("sortBy", "creation_time_descend");
  url.searchParams.set("latitude", zone.latitude.toString());
  url.searchParams.set("longitude", zone.longitude.toString());
  url.searchParams.set("radiusKM", Math.ceil(zone.radiusKm).toString());
  url.searchParams.set("daysSinceListed", globalConfig.search.maxListingAgeDays.toString());

  if (productConfig.search.minPrice != null) {
    url.searchParams.set("minPrice", productConfig.search.minPrice.toString());
  }

  if (productConfig.search.maxPrice != null) {
    url.searchParams.set("maxPrice", productConfig.search.maxPrice.toString());
  }

  return url.toString();
}

async function dismissCommonOverlays(page: Page): Promise<void> {
  const labels = ["Allow all cookies", "Not now", "Close"];

  for (const label of labels) {
    const locator = page.getByRole("button", { name: label }).first();

    if (await locator.isVisible().catch(() => false)) {
      await locator.click().catch(() => undefined);
      await delay(300);
    }
  }
}

async function ensureAuthenticated(page: Page): Promise<void> {
  const content = (await page.textContent("body").catch(() => "")) ?? "";

  if (/log in to facebook|login to facebook/i.test(content)) {
    throw new Error("Marketplace session is not authenticated. Refresh auth/facebook-marketplace.json and the GitHub secret.");
  }
}

async function collectCandidateCards(page: Page): Promise<CandidateCard[]> {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]'));

    return anchors
      .map((anchor) => {
        let node: HTMLElement | null = anchor;
        let previewText = anchor.innerText;

        for (let depth = 0; depth < 4 && node; depth += 1) {
          if (node.innerText && node.innerText.trim().length > previewText.trim().length) {
            previewText = node.innerText;
          }
          node = node.parentElement;
        }

        return {
          url: anchor.href,
          previewText: previewText.trim()
        };
      })
      .filter((card) => Boolean(card.url));
  });
}

async function extractSnapshot(page: Page, url: string, previewText: string): Promise<ListingSnapshot> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  await delay(1500);
  await dismissCommonOverlays(page);

  return page.evaluate(
    ({ listingUrl, listingPreviewText }) => {
      const metaEntries = Array.from(document.querySelectorAll("meta"))
        .map((meta) => {
          const key = meta.getAttribute("property") ?? meta.getAttribute("name");
          const value = meta.getAttribute("content");

          if (!key || !value) {
            return null;
          }

          return [key, value] as const;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null);

      return {
        url: listingUrl,
        title: document.title ?? "",
        meta: Object.fromEntries(metaEntries),
        bodyText: document.body?.innerText ?? "",
        previewText: listingPreviewText
      };
    },
    { listingUrl: url, listingPreviewText: previewText }
  );
}

async function createContext(globalConfig: GlobalConfig): Promise<BrowserContext> {
  const storageStatePath = path.resolve(globalConfig.marketplace.storageStatePath);

  try {
    await access(storageStatePath);
  } catch {
    throw new Error(
      `Missing Marketplace auth state at ${storageStatePath}. Run "npm run auth:save" locally and update the GitHub secret.`
    );
  }

  const browser = await chromium.launch({
    headless: true
  });

  return browser.newContext({
    storageState: storageStatePath,
    locale: "en-AU",
    timezoneId: "Australia/Sydney"
  });
}

export async function fetchMarketplaceListings(
  globalConfig: GlobalConfig,
  productConfig: ProductConfig
): Promise<ListingRecord[]> {
  const zones = buildSearchZones(globalConfig);
  const context = await createContext(globalConfig);
  const page = await context.newPage();
  const listingMap = new Map<string, TrackedCandidate>();

  try {
    for (const zone of zones) {
      const searchUrl = buildSearchUrl(globalConfig, productConfig, zone);
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45_000
      });
      await delay(2000);
      await dismissCommonOverlays(page);
      await ensureAuthenticated(page);

      for (let round = 0; round < globalConfig.search.scrollRounds; round += 1) {
        await page.mouse.wheel(0, 4_000);
        await delay(1_100);
      }

      const candidates = await collectCandidateCards(page);

      for (const candidate of candidates) {
        const normalizedUrl = normalizeListingUrl(candidate.url);
        const existing = listingMap.get(normalizedUrl);

        if (!existing) {
          listingMap.set(normalizedUrl, {
            url: normalizedUrl,
            previewText: candidate.previewText,
            searchZone: zone,
            discoveredInZones: [zone.label]
          });
          continue;
        }

        if (!existing.discoveredInZones.includes(zone.label)) {
          existing.discoveredInZones.push(zone.label);
        }

        const shouldPreferCurrentZone =
          zone.priorityRank < existing.searchZone.priorityRank ||
          (zone.priorityRank === existing.searchZone.priorityRank &&
            zone.radiusKm < existing.searchZone.radiusKm);

        if (shouldPreferCurrentZone) {
          existing.searchZone = zone;
          existing.previewText = candidate.previewText || existing.previewText;
        }
      }

      await delay(globalConfig.search.delayMsBetweenSearches);
    }

    const detailPage = await context.newPage();
    const selectedCandidates = Array.from(listingMap.values())
      .sort((left, right) => {
        if (left.searchZone.priorityRank !== right.searchZone.priorityRank) {
          return left.searchZone.priorityRank - right.searchZone.priorityRank;
        }

        return left.searchZone.radiusKm - right.searchZone.radiusKm;
      })
      .slice(0, globalConfig.search.maxListingsToInspect);
    const listings: ListingRecord[] = [];

    for (const candidate of selectedCandidates) {
      const snapshot = await extractSnapshot(detailPage, candidate.url, candidate.previewText);
      listings.push(parseListingRecord(snapshot, candidate));
      await delay(globalConfig.search.delayMsBetweenListings);
    }

    await detailPage.close();
    return listings;
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}
