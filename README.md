# Native Habitat Planner

A static, data-driven website that helps gardeners build **maximum-impact native habitat gardens** by recommending hyperlocal plant selections backed by real ecological data — inspired by Doug Tallamy's *Bringing Nature Home*.

**[View the live site →](https://chetanddesai.github.io/native-habitat-planner)**

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

## Why This Exists

Not all native plants are created equal. A small number of **keystone genera** — oaks, willows, goldenrods, asters — support a disproportionate share of caterpillar species, which form the base of the terrestrial food web. A garden built around keystone species, supplemented with high-wildlife-value natives in every structural layer, will produce the largest biomass and support the most diverse community of birds, pollinators, and beneficial insects.

This site curates native plant inventories for specific geographic regions, selecting species by:

1. **Keystone status** — genera identified by the National Wildlife Federation get priority
2. **Wildlife species supported** — Calscape's wildlife-supported count ranks remaining candidates
3. **Hyperlocal presence** — every plant must have iNaturalist observations in the region, confirming it actually grows there

## Regions

| Region | Ecosystem | Plants | Geographic Scope |
|---|---|---|---|
| **Auburn, CA** | Sierra Foothills Oak Woodland / Chaparral | 20 | iNaturalist `place_id=5299` |
| **Poway, CA** | Coastal Sage Scrub | 20 | Bounding box |

## Features

- **Curated plant inventory** — 15–25 native species per region, grouped by structural category (canopy → understory → shrub → groundcover), with keystone badges and wildlife support counts
- **Maintenance schedules** — 12-month watering and pruning calendars for every plant
- **Bloom & phenology timelines** — color-coded bloom, berry, and seed phenology with a garden-wide chart
- **Wildlife interactions** — specific named wildlife species per plant with activity type, seasonality, and live images from iNaturalist
- **Garden calendar** — month-navigable dashboard showing wildlife visitors (classified Common/Uncommon/Rare), maintenance tasks, and observation trends
- **Observation data** — live monthly histograms and year-over-year trends from iNaturalist, scoped to each region
- **Multi-region support** — switch between Places of Interest via a header dropdown; preference persists in `localStorage`
- **Fully static** — no server, no build step, no frameworks. Vanilla HTML, CSS, and JavaScript served from GitHub Pages

## Data Architecture

```
data/
├── places.json              # Place of Interest metadata (geographic scope, ecosystem, display text)
├── plants-auburn-ca.json    # Auburn plant inventory (20 plants)
└── plants-poway-ca.json     # Poway plant inventory (20 plants)
```

- **`places.json`** — one entry per region with geographic scope (`iNaturalistPlaceId` and/or `boundingBox`), ecosystem description, and about-section text
- **`plants-{place-id}.json`** — one entry per plant with complete data: scientific/common names, category, keystone status, wildlife species supported, planting requirements, 12-month maintenance schedule, phenology (bloom/berry/seed), and 2–4 specific wildlife interactions

Adding a plant means adding a JSON entry. Adding a region means adding a `places.json` entry and a new plant data file. No HTML changes needed.

## Data Sources

| Source | What It Provides |
|---|---|
| [iNaturalist](https://www.inaturalist.org) | Plant & wildlife images (Creative Commons), observation histograms, taxon data |
| [Calscape](https://calscape.org) | Native plant info, wildlife-supported counts, planting requirements |
| [National Wildlife Federation](https://www.nwf.org/nativeplantfinder) | Keystone species identification |

All observation data is fetched client-side at runtime from the iNaturalist API and cached in `localStorage` with a 7-day TTL. Plant inventory, maintenance, and phenology data is served from local JSON files with no API dependency.

## Local Development

No build step required. Serve the repo root with any static file server:

```bash
npx http-server . -p 8080 -c-1
```

Then open [http://localhost:8080](http://localhost:8080).

> **Note:** iNaturalist API calls may be blocked by CORS on `localhost`. Observation data and live images will load correctly when deployed to GitHub Pages.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new plants, new regions, and general contributions.

### Quick Start

- **Suggest a plant or region** — [open an issue](https://github.com/chetanddesai/native-habitat-planner/issues)
- **Add a new city** — use the `add-city` agent skill (see CONTRIBUTING.md)
- **Add a single plant** — use the `add-plant` agent skill (see CONTRIBUTING.md)

## Project Documentation

| Document | Description |
|---|---|
| [Product Requirements (PRD)](docs/PRD.md) | Functional & non-functional requirements, data schema, plant selection criteria |
| [Technical Design](docs/tech-design.md) | Architecture, data flow, component design, API integration |
| [License](LICENSE.md) | CC BY-NC-SA 4.0 with content attribution details |

## License

This work is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Plant and wildlife images are sourced from iNaturalist under their respective Creative Commons licenses.
