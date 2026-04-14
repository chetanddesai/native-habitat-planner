# Contributing

Thank you for your interest in the Native Habitat Planner! This project thrives on community contributions — whether it's adding a new city, suggesting a plant, fixing data, or improving the site.

## Ways to Contribute

### 1. Suggest a Plant or Region (No Code Required)

[Open a GitHub issue](https://github.com/chetanddesai/native-habitat-planner/issues) with:

- **For a plant:** scientific name, the region it belongs to, and why it should be included (keystone status, wildlife value, etc.)
- **For a region:** city and state, and either an [iNaturalist place ID](https://www.inaturalist.org/places) or bounding box coordinates

### 2. Report a Data Error

If you spot incorrect bloom months, wrong wildlife associations, or a misidentified plant, [open an issue](https://github.com/chetanddesai/native-habitat-planner/issues) describing what's wrong and what the correct data should be.

### 3. Add a New City

This is the most impactful contribution. Each new city brings the Tallamy-inspired habitat planning framework to another community. The process is automated through an AI agent skill that handles the research, plant selection, and data file creation.

See the full walkthrough below: [Adding a New City](#adding-a-new-city).

### 4. Add a Plant to an Existing Region

To add a single plant to a region that already exists, use the **add-plant** agent skill. See: [Adding a Single Plant](#adding-a-single-plant).

---

## Adding a New City

The `add-city` skill (`.cursor/skills/add-city/SKILL.md`) automates the full workflow for onboarding a new geographic region. It implements the plant selection algorithm from the [PRD §5](docs/PRD.md) — Tallamy's keystone-species framework — and delegates to the `add-plant` skill for each individual plant entry.

### Prerequisites

Before starting, you'll need:

1. **City and state** — e.g., "Sacramento, CA"
2. **Geographic scope** — at least one of:
   - **iNaturalist `place_id`** (preferred) — an integer ID for a named place on iNaturalist. This uses iNaturalist's curated polygon boundary, which is more precise than a rectangle. Find it by searching at [iNaturalist Places](https://www.inaturalist.org/places) or using the API:
     ```
     https://api.inaturalist.org/v1/places/autocomplete?q=PLACE_NAME
     ```
   - **Bounding box** (fallback) — four coordinates (`nelat`, `nelng`, `swlat`, `swlng`). Use when no suitable iNaturalist place exists. You can get coordinates from [OpenStreetMap](https://www.openstreetmap.org) by searching for the city.
3. **Target plant count** — default is 3–5 per structural category, 15–22 total

### Step-by-Step Process

The `add-city` skill walks through 8 phases:

#### Phase 1: Setup

The skill derives a place ID (e.g., `sacramento-ca`), identifies the local ecosystem (e.g., "Central Valley Riparian Woodland"), and verifies the geographic scope returns sufficient plant observations on iNaturalist.

#### Phase 2: Discovery

Queries iNaturalist for the most-observed native plants in the region, then cross-references with keystone genera and Calscape for wildlife support data. The keystone genera prioritized are:

| Category | Keystone Genera |
|---|---|
| Large Tree | *Quercus* (oaks), *Salix* (willows), *Populus* (cottonwoods), *Pinus* (pines), *Prunus* (wild cherries) |
| Large Shrub | *Heteromeles* (toyon), *Sambucus* (elderberry), *Ceanothus*, *Arctostaphylos* (manzanita), *Baccharis* (coyote brush) |
| Small Shrub | *Eriogonum* (buckwheats), *Salvia* (sages), *Artemisia* (sagebrush), *Ribes* (currants) |
| Herbaceous Perennial | *Asclepias* (milkweeds), *Solidago* (goldenrods), *Symphyotrichum* (asters), *Lupinus* (lupines) |
| Groundcover | *Lupinus* (annual lupines), *Eriogonum* (mat-forming buckwheats) |

#### Phase 3: Selection

Candidates are ranked using this priority:

1. **Keystone status** — species whose genus appears on the NWF keystone list rank first
2. **Wildlife species supported** — Calscape's wildlife-supported count breaks ties
3. **iNaturalist observation count** — confirms hyperlocal presence as a final tiebreaker

Target counts per category:

| Category | Target | Must Include |
|---|---|---|
| Large Tree | 3–4 | At least 2 keystone genera (oak + one other) |
| Large Shrub | 4–5 | At least 1 berry-producing species for birds |
| Small Shrub | 4–5 | Prioritize pollinator-supporting species |
| Herbaceous Perennial | 3–4 | Must include a milkweed (*Asclepias*) for Monarchs |
| Groundcover — Perennial | 1–2 | |
| Groundcover — Annual | 1–2 | At least 1 spring wildflower |

#### Phase 4: Approval

The skill presents the full candidate list with rationale for each selection. You review and approve, request substitutions, or adjust counts before any files are created.

#### Phase 5: Place of Interest Entry

Creates the entry in `data/places.json` with geographic scope, ecosystem description, hero text, and about-section content.

#### Phase 6: Plant Data

Creates `data/plants-{place-id}.json` and populates it by running the **add-plant** skill for each approved species. Each plant entry includes:

- Scientific and common names, category, keystone status
- Wildlife species supported count
- Planting requirements (sun, soil, slope)
- 12-month maintenance schedule (watering frequency, pruning months, special notes)
- Phenology (bloom months and colors, berry, seed)
- 2–4 specific wildlife interactions with species names, activity type, and seasonality

#### Phase 7: Site Updates

Updates the PRD with the new region's plant inventory table and adjusts the README to mention the new region.

#### Phase 8: Verification

Starts a local dev server and verifies the new region loads correctly — hero text, plant grid, calendar, observations, and region switching all work.

### Running the Skill

In Cursor with the agent skills enabled:

1. Open the project in Cursor
2. Start a new agent conversation
3. Ask: *"Add Sacramento, CA as a new city using the add-city skill"*
4. The agent will walk through each phase, pausing at Phase 4 for your approval before creating files

### What Gets Created

After a successful run, these files are created or modified:

| File | Change |
|---|---|
| `data/places.json` | New entry appended |
| `data/plants-{place-id}.json` | New file with 15–22 plant entries |
| `docs/PRD.md` | New plant inventory table in §6 |
| `README.md` | New region added to the Regions table |

---

## Adding a Single Plant

The `add-plant` skill (`.cursor/skills/add-plant/SKILL.md`) handles adding one plant to an existing region.

### Prerequisites

1. **Place of Interest** — which region (e.g., `auburn-ca`)
2. **Scientific name** — e.g., *Cercis occidentalis*
3. **Common name(s)** — e.g., "Western Redbud"
4. **Category** — one of: `large-tree`, `large-shrub`, `small-shrub`, `herbaceous-perennial`, `groundcover-perennial`, `groundcover-annual`

### Running the Skill

In Cursor:

1. Ask: *"Add Western Redbud (Cercis occidentalis) as a large shrub to auburn-ca using the add-plant skill"*
2. The agent researches the plant on Calscape and iNaturalist, builds the full JSON entry, and inserts it into the region's plant data file

### What the Skill Researches

For each plant, the agent looks up:

- iNaturalist taxon ID and observation presence in the region
- Calscape planting requirements (sun, soil, water needs)
- Bloom months and flower colors
- Berry/seed phenology
- 2–4 specific wildlife species that interact with the plant (caterpillar hosts, pollinators, seed eaters, etc.)
- Monthly watering schedule and pruning recommendations

---

## Data File Formats

### `data/places.json`

Each region entry contains:

```json
{
  "id": "city-st",
  "name": "City, State",
  "shortName": "City, ST",
  "ecosystem": "Ecosystem Name",
  "ecosystemDescription": "Why this ecosystem matters...",
  "iNaturalistPlaceId": 1234,
  "boundingBox": { "nelat": 0, "nelng": 0, "swlat": 0, "swlng": 0 },
  "plantDataFile": "plants-city-st.json",
  "heroDescription": "...",
  "aboutSections": { "whyNative": "...", "ecosystem": "...", "getStarted": "..." }
}
```

### `data/plants-{place-id}.json`

Each plant entry contains ~15 fields covering identification, planting requirements, maintenance, phenology, and wildlife interactions. See the [PRD §4.2](docs/PRD.md) for the complete schema.

---

## General Guidelines

- **No frameworks** — the site is vanilla HTML, CSS, and JavaScript. Keep it that way.
- **No build step** — all files are served directly. Don't introduce bundlers or transpilers.
- **Data over code** — content changes should be JSON edits, not code changes.
- **Keystone species first** — when selecting plants, always prioritize keystone genera per Tallamy's framework.
- **Genus diversity** — within each category, avoid more than 2 species from the same genus unless no alternatives exist.
- **Calscape required** — every plant should have a Calscape page. Plants without one are difficult to populate with maintenance and wildlife data.
- **Verify locally** — always test with `npx http-server . -p 8080 -c-1` before submitting a PR.

## License

By contributing, you agree that your contributions will be licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
