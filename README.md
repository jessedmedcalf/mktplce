# Marketplace Scout

Cloud-run Facebook Marketplace scouting agents with shared macros, per-product deal logic, and GitHub Actions scheduling.

## What This Gives You

- Shared search macros for every product agent, including directional range extensions.
- One YAML file per product agent, so you can add or remove products without touching code.
- Per-product deal scoring rules for prices, accessories, red flags, and bundle bonuses.
- GitHub Actions execution, so your Mac does not need to stay on.
- Markdown and JSON reports for each run.

## Project Layout

- `config/global.yaml`: shared search profile, shared scoring rules, and report thresholds.
- `agents/*.yaml`: one file per product agent.
- `templates/product-agent.yaml`: copy this to add a new product.
- `src/`: fetch, scoring, and report logic.
- `.github/workflows/marketplace-scout.yaml`: scheduled cloud automation.

## Shared Macros

The global config is where you change values that should affect every agent. Example:

```yaml
search:
  baseRadiusKm: 25
  directionalExtensionsKm:
    west: 10
```

That creates an extra Marketplace search sweep shifted west, so every product agent looks 10km further west without broadening the search equally in every direction.

## Add Or Remove Products

1. Copy [templates/product-agent.yaml](/Users/jessemedcalf/mktplce/templates/product-agent.yaml) into `agents/`.
2. Give it a unique `id` and a Marketplace `query`.
3. Tune the price bands and keyword adjustments.
4. Set `enabled: true` to include it in GitHub runs.
5. Remove the file or set `enabled: false` to swap it out.

## Local Setup

1. Install dependencies:

```bash
npm install
npx playwright install chromium
```

2. Save an authenticated Marketplace browser session:

```bash
npm run auth:save
```

This opens Chromium. Log in to Facebook, open Marketplace, then press Enter in the terminal. The session is saved to `auth/facebook-marketplace.json`.

3. Update [config/global.yaml](/Users/jessemedcalf/mktplce/config/global.yaml) with your home coordinates and Marketplace region slug.

4. Run all enabled agents locally:

```bash
npm run run
```

Or a single agent:

```bash
npm run run:agent -- --file agents/playstation-4.yaml
```

## GitHub Actions Setup

1. Create a GitHub repo from this folder and push it.
2. Add a GitHub Actions secret named `MARKETPLACE_STORAGE_STATE_B64`.
3. Base64-encode your local auth file and paste that into the secret:

```bash
base64 -i auth/facebook-marketplace.json
```

4. The workflow at [marketplace-scout.yaml](/Users/jessemedcalf/mktplce/.github/workflows/marketplace-scout.yaml) runs every 6 hours and also supports manual dispatch.

## Outputs

Each agent run writes:

- `out/<agent-id>.json`
- `out/<agent-id>.md`

In GitHub Actions those files are uploaded as artifacts and the Markdown summary is appended to the workflow summary.

## Notes

- Facebook changes DOM structure often. The extractor is built around robust link discovery and page text parsing, but you should expect to recalibrate selectors occasionally.
- If the saved auth session expires, rerun `npm run auth:save` locally and update the GitHub secret.
