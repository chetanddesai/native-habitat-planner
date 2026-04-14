# Native Habitat Planner — Product Requirements Document

**Project:** Native Habitat Garden Planner — Multi-Region California
**Version:** 0.1 (Draft)
**Last Updated:** 2026-04-14
**Inspiration:** Doug Tallamy's *Bringing Nature Home* — selecting plants that support the largest biomass of native insects, birds, and wildlife

---

## 1. Overview

A static informational website that helps gardeners build **maximum-impact native habitat gardens** by recommending hyperlocal plant selections backed by real ecological data. The site supports multiple **Places of Interest** — regions defined by either an **iNaturalist `place_id`** (a named, polygon-bounded place like a city, park, or recreation area) or a **manual bounding box** (latitude/longitude coordinates). For each region, the site presents a curated inventory of 15–25 native plants selected using Doug Tallamy's keystone-species framework: **keystone species first, then highest wildlife support**.

All content is data-driven (JSON-backed, one file per Place of Interest) so that adding or editing plants requires no code changes. Observation and wildlife data is fetched client-side at runtime from iNaturalist and cached locally.

### Core Thesis (Tallamy's Framework)

> Not all native plants are created equal. A small number of **keystone genera** (oaks, willows, goldenrods, asters, etc.) support a disproportionate share of caterpillar species, which form the base of the terrestrial food web. A garden built around keystone species — supplemented with high-wildlife-value natives in every structural layer — will produce the largest biomass and support the most diverse community of birds, pollinators, and beneficial insects.

### Selection Philosophy

For each Place of Interest, the plant inventory is curated across structural categories to create a complete **layered habitat** (canopy → understory → shrub → groundcover), with species chosen by:

1. **Keystone status** (National Wildlife Federation data) — keystone genera get priority
2. **Wildlife species supported** (Calscape "wildlife supported" count, iNaturalist observation density) — among remaining candidates, the species supporting the most wildlife wins
3. **Hyperlocal presence** — the plant must have iNaturalist observations within the region's geographic scope (bounding box or place_id), confirming it actually grows there

---

## 2. Non-Functional Requirements

### 2.1 Hosting & Technology


| Constraint          | Detail                                                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting**         | GitHub Pages (static only — no server-side rendering)                                                                                                                                                                                                 |
| **Allowed assets**  | HTML, CSS, JavaScript (vanilla or lightweight library), JSON data files, image assets                                                                                                                                                                 |
| **Build step**      | None required. The site must work by serving the repo root (or a configured publish directory) directly. A lightweight build step (e.g., a Node script to generate HTML from JSON) is acceptable as long as the **output** is committed static files. |
| **Browser support** | Latest two versions of Chrome, Safari, Firefox, Edge; mobile Safari & Chrome on iOS/Android                                                                                                                                                           |


### 2.2 Data Architecture


| Requirement                      | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data format**                  | JSON files stored in a `data/` directory. One `places.json` for Place of Interest metadata, and one `plants-{place-id}.json` per region for plant inventories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Schema**                       | Each plant is a single JSON object containing all inventory, schedule, bloom, and wildlife data (see §4 for schema). Each Place of Interest is a JSON object with geographic scope (bounding box and/or iNaturalist `place_id`), display name, and ecosystem description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Extensibility**                | Adding a new plant = adding a JSON entry to the appropriate regional file. Adding a new Place of Interest = adding a JSON entry to `places.json` + a new plant data file. No HTML changes needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Image strategy**               | All plant and wildlife images hotlinked from iNaturalist CDN (no local copies). The site displays skeleton/placeholder states while images load and caches images locally in the browser after first load.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **iNaturalist observation data** | All observation data (plant and wildlife) is fetched **client-side at runtime** from the iNaturalist `/observations/histogram` API, scoped to the **active Place of Interest's geographic scope** — either `place_id=N` (preferred when an iNaturalist place exists) or bounding box coordinates (`nelat`, `nelng`, `swlat`, `swlng`) — over a **rolling 5-year window**. Plant observations use `taxon_id` with both `month_of_year` and `year` intervals (2 calls per plant). Wildlife observations use `taxon_name` with `month_of_year` interval (1 call per species). All results are cached in `localStorage` with a **7-day TTL**, keyed by place + taxon. A footer "Refresh Data" button allows manual cache clearing. No server-side scripts or pre-computation needed. |


### 2.3 Favicons & Touch Icons


| Asset                    | Specification                                                             |
| ------------------------ | ------------------------------------------------------------------------- |
| **favicon.ico**          | 16×16 and 32×32 multi-resolution ICO                                      |
| **favicon.svg**          | SVG favicon for modern browsers                                           |
| **apple-touch-icon.png** | 180×180 PNG                                                               |
| **Android icons**        | 192×192 and 512×512 PNGs referenced via `site.webmanifest`                |
| `**site.webmanifest`**   | Standard Web App Manifest with name, icons, theme_color, background_color |


### 2.4 Performance & Accessibility


| Requirement                  | Detail                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Lighthouse score targets** | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90, SEO ≥ 90                                            |
| **Page weight**              | < 500 KB first load (excluding off-site images)                                                                |
| **Accessibility**            | Semantic HTML, ARIA landmarks, sufficient color contrast (WCAG AA), keyboard-navigable, alt text on all images |
| **Responsive design**        | Mobile-first; must look great on 375px–1440px+ viewports                                                       |


### 2.5 SEO & Social Sharing


| Requirement         | Detail                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Meta tags**       | `<title>`, `<meta name="description">`, Open Graph (`og:title`, `og:description`, `og:image`), Twitter Card |
| **Structured data** | JSON-LD for the site (WebSite schema) — stretch goal                                                        |


---

## 3. Functional Requirements

### 3.0 Place of Interest Selector

The site supports multiple geographic regions. Users toggle between them via a **prominent selector** in the site header (dropdown or pill toggle). Switching regions:

- Loads the corresponding plant inventory JSON (`data/plants-{place-id}.json`)
- Updates all geographically-scoped iNaturalist API calls to use the new region's scope (`place_id` or bounding box)
- Updates hero text, ecosystem description, and "About" section context
- Persists the selection in `localStorage` so returning users see their last-viewed region

#### Geographic Scoping Modes

Each Place of Interest uses one of two modes for iNaturalist API queries:


| Mode             | iNaturalist API Parameter                 | When to Use                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**place_id`**   | `place_id=N` (integer)                    | Preferred when an iNaturalist place exists for the region. Uses iNaturalist's curated polygon boundary (often more accurate than a rectangle). Find place IDs via `https://api.inaturalist.org/v1/places/autocomplete?q=PLACE_NAME` or on the iNaturalist website URL (e.g., `inaturalist.org/observations?place_id=962` for San Diego County). |
| **Bounding box** | `nelat=...&nelng=...&swlat=...&swlng=...` | Fallback when no suitable iNaturalist place exists, or when a custom rectangular area is needed.                                                                                                                                                                                                                                                |


A Place of Interest may specify **both** — the `place_id` is used for API calls (polygon precision) while the bounding box is used as a fallback and for the "View on iNaturalist" search URL. If only one is provided, that mode is used for everything.

#### Starting Places of Interest


| Place ID    | Display Name               | Ecosystem                                 | iNaturalist Place ID | Bounding Box                                                                 |
| ----------- | -------------------------- | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `poway-ca`  | Poway, California          | Coastal Sage Scrub                        | —                    | nelat: 33.0652649, nelng: -116.9575429, swlat: 32.899128, swlng: -117.103013 |
| `auburn-ca` | Auburn, California (95603) | Sierra Foothills Oak Woodland / Chaparral | —                    | nelat: 38.986542, nelng: -120.9610799, swlat: 38.831071, swlng: -121.191049  |


### 3.1 Plant Inventory

The primary section of the site. Each plant entry displays:


| Field                                | Source / Notes                                                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Common name(s)**                   | May have multiple common names                                                                                                                                                                                                                                         |
| **Scientific name**                  | Displayed in *italics* per convention                                                                                                                                                                                                                                  |
| **Synonyms**                         | Former scientific names where applicable                                                                                                                                                                                                                               |
| **Hero image**                       | Hotlinked from iNaturalist CDN (Creative Commons licensed). Skeleton placeholder shown while loading; cached locally in the browser after first load.                                                                                                                  |
| **Image citation**                   | Photographer name, license type, and link back to the iNaturalist observation                                                                                                                                                                                          |
| **Calscape link**                    | Direct URL to the plant's page on calscape.org (nursery availability, growing info)                                                                                                                                                                                    |
| **iNaturalist observation data**     | Monthly observation histogram (Jan–Dec) showing when this plant is most commonly sighted in the active region by citizen scientists, plus year-over-year totals for trend analysis. A frequency indicator (Common / Uncommon / Rare) is derived from the 5-year total. |
| **Description**                      | 2–4 sentence narrative about the plant's role in supporting native wildlife, emphasizing Tallamy's food-web perspective (caterpillar support, bird food chain, pollinator value)                                                                                       |
| **Keystone species indicator**       | Boolean flag + visual badge if true. Keystone plants are called out prominently as high-impact species per NWF/Tallamy.                                                                                                                                                |
| **Wildlife species supported count** | Number of wildlife species this plant supports (sourced from Calscape), displayed as a secondary ranking metric                                                                                                                                                        |
| **Category**                         | One of: `Large Tree`, `Large Shrub`, `Small Shrub`, `Groundcover — Perennial`, `Groundcover — Annual`, `Herbaceous Perennial`                                                                                                                                          |


#### Planting Requirements

Static site-condition data displayed as part of each plant's inventory card/detail:


| Field                 | Detail                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| **Sun exposure**      | Full Sun, Part Shade, Full Shade, or combination                            |
| **Slope / drainage**  | Flat, gentle slope, steep slope, well-drained required, clay-tolerant, etc. |
| **Soil requirements** | Sandy, loam, clay, serpentine-tolerant, pH preference, amendment notes      |


These do not vary month-to-month and are therefore part of the plant profile rather than the maintenance schedule.

#### Sorting & Filtering

- Default sort: grouped by category in the order: Large Tree → Large Shrub → Small Shrub → Herbaceous Perennial → Groundcover — Perennial → Groundcover — Annual
- Within each category: keystone species first, then sorted by wildlife species supported (descending), then alphabetical by common name
- Filter/search bar to quickly find a plant by common or scientific name
- Filter by: keystone species only, bloom color, wildlife supported
- Category filter pills to show a single structural layer

### 3.2 Maintenance Schedule

A calendar-oriented view (12 months) for each plant covering time-varying care tasks:


| Field                   | Detail                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Watering schedule**   | Per-month numeric frequency: `0` = none, `1` = once/month, `2` = twice/month. Displayed as "1×", "2×" in the UI.                      |
| **Watering notes**      | Free-text description of watering strategy (e.g., "Deep water monthly in summer for first 2–3 years; no irrigation once established") |
| **Pruning months**      | Array of 1-indexed months when pruning should be done                                                                                 |
| **Pruning task**        | Short actionable description of what to do (e.g., "Cut back by half for fall rebloom", "Remove dead or crossing branches")            |
| **Pruning notes**       | Longer free-text explanation of pruning approach and timing                                                                           |
| **Special maintenance** | Deadheading, dividing, fire-clearing, pest notes                                                                                      |


> **Note:** Static planting conditions (sun exposure, slope/drainage, soil) live in the Plant Inventory section under Planting Requirements (§3.1) since they don't vary by month.

#### Presentation

- Per-plant: 12-month grid showing watering frequency and pruning tasks, with current-month highlighting
- Garden-wide: two-column layout in the Garden Calendar — **Watering** (plant name + frequency like "1×/month") and **Pruning** (plant name + actionable task description) — for the selected month
- Columns stack vertically on mobile; empty columns show "None this month"

### 3.3 Bloom, Berry & Seed Schedule

A phenology calendar for each plant:


| Field                  | Detail                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Bloom months**       | Start and end month                                                                                    |
| **Bloom color(s)**     | Displayed as a color swatch + label                                                                    |
| **Berry/fruit months** | Start and end month (if applicable)                                                                    |
| **Berry/fruit color**  | Color swatch + label                                                                                   |
| **Seed months**        | Start and end month                                                                                    |
| **Ecological value**   | What the bloom/berry/seed supports (e.g., "Nectar for native bees; berries eaten by Western Bluebird") |


#### Presentation

- 12-month timeline rows showing actual botanical colors: bloom cells use the plant's real flower color(s) (gradient for multi-color blooms), berry cells use the fruit color with a dot indicator, and seed cells use a tan stripe pattern
- Garden-wide phenology chart showing which plants are blooming/fruiting in each month
- Filter by bloom color

### 3.4 Wildlife Schedule

A month-by-month wildlife interaction calendar per plant:


| Field                 | Detail                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Month**             | 1–12                                                                                                                                                                                                                                                                    |
| **Wildlife visitors** | **Specific, identifiable species only** (e.g., "Monarch butterfly", "Anna's Hummingbird", "Acmon Blue butterfly"). Generic groupings like "native bees" or "hover flies" belong in the plant description and `ecologicalValue` field, not as separate wildlife entries. |
| **Wildlife image**    | Hotlinked from iNaturalist CDN (Creative Commons). Same loading/caching strategy as plant images. Attribution stored with the image URL.                                                                                                                                |
| **Activity**          | What they're doing: nectar/pollen foraging, eating seeds, eating berries, nesting, caterpillar host plant, shelter/roosting                                                                                                                                             |
| **Notes**             | Any special observations (e.g., "Monarch caterpillars exclusively feed on milkweed")                                                                                                                                                                                    |


> **Guideline — specific species only:** Each wildlife entry must name a specific, identifiable species (or a named species-level organism like "Bombus crotchii"). Broad groups such as "Native bees", "Native solitary bees (Halictidae)", or "Hover flies (Syrphidae)" should **not** appear as wildlife entries. Instead, fold that information into the plant's `description` field or the phenology `ecologicalValue` field where it serves as useful ecological context without cluttering the wildlife tab with entries that can't produce a meaningful image or calendar marker.

#### Presentation

- Per-plant: 12-month grid showing active months for each wildlife species, with current-month highlighting and clickable images/names linking to iNaturalist
- Garden-wide "Wildlife to Look For" section in the Garden Calendar:
  - Wildlife entries are **deduplicated by species** across all plants — each species appears once with all its interactions consolidated (e.g., "Anna's Hummingbird · 46 obs/mo" with "Nectar / Pollen on Black Sage, Red Bush Monkeyflower, Tornleaf Goldeneye")
  - Species are classified into **Common / Uncommon / Rare** columns based on the wildlife species' own monthly observation count in the active region (fetched from iNaturalist at runtime, cached in localStorage)
  - Rarity thresholds are calculated dynamically (percentile-based on the current month's data) and displayed in column headers (e.g., "Common ≥ 9 obs", "Rare < 9 obs")
  - Each entry includes the species photo, observation count, and a breakdown of activities by host plant
- Optional: wildlife-centric view — pick a species, see which plants support it and when

---

## 4. Data Schema

### 4.1 Places of Interest — `data/places.json`

```json
[
  {
    "id": "poway-ca",
    "name": "Poway, California",
    "shortName": "Poway, CA",
    "ecosystem": "Coastal Sage Scrub",
    "ecosystemDescription": "San Diego County's coastal sage scrub — one of the most endangered habitats in the United States. Less than 15% remains, making backyard habitat gardens a meaningful act of conservation for species like the California Gnatcatcher and Crotch's Bumblebee.",
    "iNaturalistPlaceId": null,
    "boundingBox": {
      "nelat": 33.0652649,
      "nelng": -116.9575429,
      "swlat": 32.899128,
      "swlng": -117.103013
    },
    "plantDataFile": "plants-poway-ca.json",
    "heroDescription": "A living guide to California native plants selected for maximum wildlife impact in Poway's coastal sage scrub — keystone species first, then the plants that support the most birds, butterflies, and pollinators.",
    "aboutSections": {
      "whyNative": "California's native plants have co-evolved with local wildlife for thousands of years. They require less water, no fertilizers, and no pesticides — while supporting 10–50× more wildlife than non-native alternatives. A single native oak supports over 300 species of insects, birds, and mammals.",
      "ecosystem": "Poway sits within San Diego County's coastal sage scrub ecosystem — one of the most endangered habitats in the United States. Less than 15% remains, making backyard habitat gardens a meaningful act of conservation for species like the California Gnatcatcher and Crotch's Bumblebee.",
      "getStarted": "Begin with 3–5 keystone species: California Buckwheat, Black Sage, Toyon, and a native oak. Visit Calscape.org to find plants native to your zip code and local nurseries that carry them. Remove your lawn, stop irrigating in summer, and watch the wildlife arrive."
    }
  },
  {
    "id": "auburn-ca",
    "name": "Auburn, California",
    "shortName": "Auburn, CA",
    "ecosystem": "Sierra Foothills Oak Woodland / Chaparral",
    "ecosystemDescription": "Auburn sits at the transition between the Sacramento Valley floor and the Sierra Nevada foothills, in a zone of blue oak woodland, interior live oak chaparral, and mixed foothill pine. These habitats support an extraordinary diversity of woodpeckers, raptors, and native pollinators.",
    "iNaturalistPlaceId": null,
    "boundingBox": {
      "nelat": 38.986542,
      "nelng": -120.9610799,
      "swlat": 38.831071,
      "swlng": -121.191049
    },
    "plantDataFile": "plants-auburn-ca.json",
    "heroDescription": "A living guide to California native plants selected for maximum wildlife impact in Auburn's Sierra foothills — keystone species first, then the plants that support the most birds, butterflies, and pollinators.",
    "aboutSections": {
      "whyNative": "California's native plants have co-evolved with local wildlife for thousands of years. They require less water, no fertilizers, and no pesticides — while supporting 10–50× more wildlife than non-native alternatives. A single native oak supports over 300 species of insects, birds, and mammals.",
      "ecosystem": "Auburn sits at the transition between the Sacramento Valley and the Sierra Nevada foothills, in a zone of blue oak woodland, interior live oak chaparral, and mixed foothill pine. These fire-adapted habitats support an extraordinary diversity of woodpeckers, raptors, and native pollinators — but are increasingly threatened by development and altered fire regimes.",
      "getStarted": "Begin with 3–5 keystone species: Valley Oak or Blue Oak, Coyote Brush, California Buckwheat, and a native milkweed. Visit Calscape.org to find plants native to your zip code and local nurseries that carry them."
    }
  }
]
```

### 4.2 Plant Data — `data/plants-{place-id}.json`

Each plant object follows the same schema as the reference project. One JSON array per Place of Interest:

```json
{
  "id": "quercus-lobata",
  "commonNames": ["Valley Oak", "Roble"],
  "scientificName": "Quercus lobata",
  "synonyms": [],
  "category": "large-tree",
  "isKeystone": true,
  "wildlifeSpeciesSupported": 334,
  "description": "The largest North American oak and a keystone species supporting over 300 species of caterpillars — the essential protein source for nesting birds. Valley Oaks define the Sacramento Valley's savanna landscape and anchor the entire food web.",
  "image": {
    "url": "",
    "attribution": "",
    "iNaturalistUrl": ""
  },
  "calscapeUrl": "https://calscape.org/Quercus-lobata-(Valley-Oak)",
  "iNaturalistData": {
    "taxonId": 54813,
    "searchUrl": "https://www.inaturalist.org/observations?taxon_id=54813&nelat=38.986542&nelng=-120.9610799&swlat=38.831071&swlng=-121.191049"
  },
  "plantingRequirements": {
    "sunExposure": "Full Sun",
    "slopeRequirements": "Deep soil, tolerates seasonal flooding, well-drained preferred",
    "soilRequirements": "Deep loam to clay, tolerates heavy clay, pH adaptable"
  },
  "maintenance": {
    "wateringSchedule": {
      "jan": 0, "feb": 0, "mar": 0, "apr": 0,
      "may": 0, "jun": 0, "jul": 0, "aug": 0,
      "sep": 0, "oct": 0, "nov": 0, "dec": 0
    },
    "wateringNotes": "No summer water once established — critical for oak health. Summer irrigation causes root rot (Phytophthora).",
    "pruningMonths": [12, 1],
    "pruningTask": "Remove dead, crossing, or damaged branches during dormancy",
    "pruningNotes": "Prune only during winter dormancy (Dec–Jan). Never prune during the warm season to avoid oak bark beetle and Sudden Oak Death transmission.",
    "specialNotes": "Keep a mulch-free zone 1–2 feet from trunk. No irrigation within drip line of established trees."
  },
  "phenology": {
    "bloom": {
      "months": [3, 4],
      "colors": ["green"]
    },
    "berry": null,
    "seed": {
      "months": [9, 10, 11],
      "description": "Large acorns ripen in fall — critical food source for jays, woodpeckers, squirrels, and deer"
    },
    "ecologicalValue": "Supports 300+ caterpillar species (essential bird food); acorns feed jays, woodpeckers, squirrels, deer; cavity nesting for owls and woodpeckers"
  },
  "wildlife": [
    {
      "months": [3, 4, 5, 6, 7],
      "species": "Polyphemus moth",
      "activity": "caterpillar-host",
      "notes": "One of the largest North American moths; caterpillars feed on oak foliage",
      "image": { "url": "", "attribution": "", "iNaturalistUrl": "" }
    },
    {
      "months": [4, 5, 6, 7, 8],
      "species": "Acorn Woodpecker",
      "activity": "nesting",
      "notes": "Colonial nesters that store acorns in granary trees; depend on oaks year-round",
      "image": { "url": "", "attribution": "", "iNaturalistUrl": "" }
    },
    {
      "months": [9, 10, 11],
      "species": "California Scrub-Jay",
      "activity": "eating-seeds",
      "notes": "Major acorn disperser — buries thousands of acorns, many of which germinate into new trees",
      "image": { "url": "", "attribution": "", "iNaturalistUrl": "" }
    }
  ]
}
```

**Key addition to the schema vs. the reference project:**


| New Field                  | Type    | Purpose                                                                                                                            |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `wildlifeSpeciesSupported` | integer | Number of wildlife species this plant supports (from Calscape). Used as a secondary selection criterion and displayed on the card. |


All other fields follow the same schema as the [SD Habitat reference project](https://github.com/chetanddesai/sd-habitat).

### Category Enum Values


| Value                   | Display Label           |
| ----------------------- | ----------------------- |
| `large-tree`            | Large Tree              |
| `large-shrub`           | Large Shrub             |
| `small-shrub`           | Small Shrub             |
| `groundcover-perennial` | Groundcover — Perennial |
| `groundcover-annual`    | Groundcover — Annual    |
| `herbaceous-perennial`  | Herbaceous Perennial    |


### Activity Enum Values


| Value              | Display Label            |
| ------------------ | ------------------------ |
| `nectar-pollen`    | Nectar / Pollen Foraging |
| `eating-seeds`     | Eating Seeds             |
| `eating-berries`   | Eating Berries           |
| `nesting`          | Nesting                  |
| `caterpillar-host` | Caterpillar Host Plant   |
| `shelter`          | Shelter / Roosting       |
| `browsing`         | Browsing Foliage         |


---

## 5. Plant Selection Criteria

This is the core methodology inspired by Doug Tallamy's *Bringing Nature Home*. For each Place of Interest, we build a **layered habitat** by selecting 3–5 species per structural category.

### 5.1 Selection Algorithm

For each category (Large Tree, Large Shrub, Small Shrub, Herbaceous Perennial, Groundcover):

```
1. QUERY iNaturalist for native plant taxa observed within the region's geographic scope
   — use `place_id=N` if the place has an iNaturalist place ID
   — otherwise use bounding box coordinates (nelat, nelng, swlat, swlng)
2. FILTER to species appropriate for the category (tree, shrub, groundcover, etc.)
3. FILTER to species that appear on Calscape (confirming California native status + data availability)
4. RANK by:
   a. Keystone status (NWF keystone genera list) — keystone species sort to top
   b. Wildlife species supported (Calscape count) — descending
   c. iNaturalist observation count in the geographic scope — as a tiebreaker / confirmation of local presence
5. SELECT top 3–5 species per category
6. VERIFY each species has:
   - A valid iNaturalist taxon ID
   - At least 1 observation in the geographic scope (confirming hyperlocal presence)
   - Calscape data for planting requirements, bloom schedule, etc.
```

### 5.2 Keystone Genera (NWF / Tallamy)

The following genera are designated as keystone by the National Wildlife Federation, meaning they support a disproportionate number of caterpillar species (the base of the food web):


| Genus                      | Common Name            | Category Typical                   |
| -------------------------- | ---------------------- | ---------------------------------- |
| *Quercus*                  | Oaks                   | Large Tree                         |
| *Salix*                    | Willows                | Large Tree / Large Shrub           |
| *Prunus*                   | Wild plums, cherries   | Large Shrub / Small Tree           |
| *Betula*                   | Birches                | Large Tree                         |
| *Populus*                  | Cottonwoods, aspens    | Large Tree                         |
| *Acer*                     | Maples                 | Large Tree                         |
| *Pinus*                    | Pines                  | Large Tree                         |
| *Ceanothus*                | California Lilacs      | Large Shrub / Small Shrub          |
| *Arctostaphylos*           | Manzanitas             | Large Shrub / Small Shrub          |
| *Baccharis*                | Coyote Brush, etc.     | Large Shrub                        |
| *Eriogonum*                | Buckwheats             | Small Shrub / Groundcover          |
| *Solidago*                 | Goldenrods             | Herbaceous Perennial               |
| *Aster* / *Symphyotrichum* | Asters                 | Herbaceous Perennial               |
| *Lupinus*                  | Lupines                | Groundcover / Herbaceous Perennial |
| *Asclepias*                | Milkweeds              | Herbaceous Perennial               |
| *Artemisia*                | Sagebrush              | Small Shrub                        |
| *Salvia*                   | Sages                  | Small Shrub                        |
| *Heteromeles*              | Toyon                  | Large Shrub                        |
| *Ribes*                    | Currants, gooseberries | Small Shrub                        |
| *Sambucus*                 | Elderberries           | Large Shrub                        |


### 5.3 Data Sources for Selection


| Source                           | What it provides                                                                          | How it's used                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **iNaturalist API**              | Observation counts by place_id or bounding box, taxon IDs, photos                         | Confirms hyperlocal presence; provides images and observation data at runtime |
| **Calscape**                     | Wildlife species supported count, planting requirements, bloom data, nursery availability | Primary source for wildlife support ranking and all plant care data           |
| **National Wildlife Federation** | Keystone species designation by genus                                                     | Primary selection criterion — keystone genera get priority                    |
| **Doug Tallamy's research**      | Caterpillar–bird food web data, keystone genus rankings                                   | Philosophical framework and validation of selection priorities                |


---

## 6. Starting Plant Inventories

### 6.1 Poway, CA — Coastal Sage Scrub


| #   | Scientific Name                      | Common Name(s)        | Category                | Keystone | Selection Rationale                                                                       |
| --- | ------------------------------------ | --------------------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------- |
| 1   | *Quercus engelmannii*                | Engelmann Oak         | Large Tree              | Yes      | Keystone genus (*Quercus*); supports 300+ caterpillar species; iconic to inland San Diego |
| 2   | *Quercus agrifolia*                  | Coast Live Oak        | Large Tree              | Yes      | Keystone genus; evergreen oak providing year-round habitat; massive wildlife support      |
| 3   | *Salix lasiolepis*                   | Arroyo Willow         | Large Tree              | Yes      | Keystone genus (*Salix*); supports 300+ caterpillar species; riparian anchor              |
| 4   | *Heteromeles arbutifolia*            | Toyon                 | Large Shrub             | Yes      | Keystone genus; berries feed 20+ bird species; caterpillar host                           |
| 5   | *Sambucus nigra* subsp. *caerulea*   | Blue Elderberry       | Large Shrub             | Yes      | Keystone genus (*Sambucus*); berries are critical bird food; high wildlife support        |
| 6   | *Baccharis sarothroides*             | Desert Broom          | Large Shrub             | Yes      | Keystone genus (*Baccharis*); late-season nectar source; high caterpillar support         |
| 7   | *Malosma laurina*                    | Laurel Sumac          | Large Shrub             | No       | Extremely high wildlife support in coastal sage scrub; evergreen structure                |
| 8   | *Xylococcus bicolor*                 | Mission Manzanita     | Large Shrub             | Yes      | Dominant local manzanita (336 obs vs 39 for Eastwood); critical winter nectar; dense bird cover |
| 9   | *Eriogonum fasciculatum*             | California Buckwheat  | Small Shrub             | Yes      | Keystone genus (*Eriogonum*); supports 50+ native bee species; top nectar source          |
| 10  | *Salvia mellifera*                   | Black Sage            | Small Shrub             | Yes      | Keystone genus (*Salvia*); premier hummingbird and pollinator plant                       |
| 11  | *Salvia apiana*                      | White Sage            | Small Shrub             | Yes      | Keystone genus; important pollinator plant; cultural significance                         |
| 12  | *Artemisia californica*              | California Sagebrush  | Small Shrub             | Yes      | Keystone genus (*Artemisia*); defines coastal sage scrub; high caterpillar host           |
| 13  | *Encelia californica*                | Bush Sunflower        | Small Shrub             | No       | High wildlife support; long bloom season; important pollinator resource                   |
| 14  | *Diplacus puniceus*                  | Red Bush Monkeyflower | Small Shrub             | No       | Key hummingbird plant; long bloom season bridges nectar gaps                              |
| 15  | *Asclepias fascicularis*             | Narrowleaf Milkweed   | Herbaceous Perennial    | Yes      | Keystone genus (*Asclepias*); obligate Monarch host plant; critical conservation species  |
| 16  | *Epilobium canum*                    | California Fuchsia    | Herbaceous Perennial    | No       | Premier late-season hummingbird nectar source when little else blooms                     |
| 17  | *Eriophyllum confertiflorum*         | Golden Yarrow         | Herbaceous Perennial    | No       | High pollinator value; long bloom season; drought-tolerant groundcover                    |
| 18  | *Bahiopsis laciniata*                | San Diego Sunflower   | Small Shrub             | No       | Long bloom season; important pollinator and seed source; local endemic                    |
| 19  | *Acmispon glaber* var. *brevialatus* | Short-winged Deerweed | Groundcover — Perennial | No       | Nitrogen-fixer; caterpillar host for multiple butterfly species                           |
| 20  | *Lupinus succulentus*                | Arroyo Lupine         | Groundcover — Annual    | Yes      | Keystone genus (*Lupinus*); nitrogen-fixer; butterfly host plant; spring wildflower       |
| 21  | *Ceanothus tomentosus*               | Woollyleaf Ceanothus  | Large Shrub             | Yes      | Keystone genus (*Ceanothus*); 85 obs; 83 butterfly/moth spp; quintessential SD chaparral  |


### 6.2 Auburn, CA — Sierra Foothills Oak Woodland


| #   | Scientific Name                    | Common Name(s)             | Category                | Keystone | Selection Rationale                                                                                               |
| --- | ---------------------------------- | -------------------------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | *Quercus lobata*                   | Valley Oak                 | Large Tree              | Yes      | Keystone genus; largest North American oak; 300+ caterpillar species; acorn food web anchor                       |
| 2   | *Quercus douglasii*                | Blue Oak                   | Large Tree              | Yes      | Keystone genus; defines foothill woodland; drought-deciduous; massive wildlife support                            |
| 3   | *Quercus wislizeni*                | Interior Live Oak          | Large Tree              | Yes      | Keystone genus; evergreen foothill oak; year-round habitat and food                                               |
| 4   | *Aesculus californica*             | California Buckeye         | Large Tree              | No       | High caterpillar support; early bloom critical for spring pollinators; iconic foothill tree                       |
| 5   | *Heteromeles arbutifolia*          | Toyon                      | Large Shrub             | Yes      | Keystone genus; berries feed 20+ bird species; adaptable across elevations                                        |
| 6   | *Ceanothus cuneatus*               | Buck Brush                 | Large Shrub             | Yes      | Keystone genus (*Ceanothus*); nitrogen-fixer; major pollinator resource; high caterpillar host                    |
| 7   | *Arctostaphylos viscida*           | Sticky Whiteleaf Manzanita | Large Shrub             | Yes      | Keystone genus; early bloom (Jan–Mar) critical for overwintering pollinators; berry food                          |
| 8   | *Baccharis pilularis*              | Coyote Brush               | Large Shrub             | Yes      | Keystone genus (*Baccharis*); 94 obs; critical late-season nectar (Sep–Dec); replaces Blue Elderberry (9 obs)     |
| 9   | *Cercis occidentalis*              | Western Redbud             | Large Shrub             | No       | 94 obs; earliest spring pollinator resource (Feb–Apr); replaces Hollyleaf Redberry (15 obs)                       |
| 10  | *Eriogonum nudum*                  | Naked Buckwheat            | Small Shrub             | Yes      | Keystone genus (*Eriogonum*); important pollinator plant in foothill habitats                                     |
| 11  | *Epilobium canum*                  | California Fuchsia         | Small Shrub             | No       | Premier late-season hummingbird resource (55 obs in bbox); fills summer–fall nectar gap when nothing else blooms  |
| 12  | *Artemisia douglasiana*            | Mugwort                    | Small Shrub             | Yes      | Keystone genus; caterpillar host for Painted Lady and other butterflies                                           |
| 13  | *Eriodictyon californicum*         | Yerba Santa                | Small Shrub             | No       | High pollinator value; butterfly host plant; important foothill native                                            |
| 14  | *Diplacus grandiflorus*            | Largeflower Bush Monkeyflower | Small Shrub          | No       | 28 obs (2× Sticky Monkeyflower); Sierra foothill endemic; key hummingbird + Checkerspot host                     |
| 15  | *Asclepias cordifolia*             | Heart-leaf Milkweed        | Herbaceous Perennial    | Yes      | Keystone genus; dominant foothill Monarch host (93 obs vs 15 for narrowleaf); far more hyperlocal                 |
| 16  | *Iris macrosiphon*                 | Bowltube Iris              | Herbaceous Perennial    | No       | 6th most observed native in bbox (130 obs); spring nectar for emerging pollinators; no *Solidago* present in area |
| 17  | *Lupinus albifrons*                | Silver Lupine              | Herbaceous Perennial    | Yes      | Keystone genus; nitrogen-fixer; butterfly host; beautiful foothill native                                         |
| 18  | *Clarkia unguiculata*              | Elegant Clarkia            | Groundcover — Annual    | No       | High pollinator value; important spring wildflower; easy to grow from seed                                        |
| 19  | *Eschscholzia californica*         | California Poppy           | Groundcover — Annual    | No       | State flower; important pollinator resource; easy groundcover                                                     |
| 20  | *Achillea millefolium*             | Common Yarrow              | Groundcover — Perennial | No       | High pollinator value; supports beneficial insects; excellent groundcover                                         |
| 21  | *Pinus sabiniana*                  | Gray Pine                  | Large Tree              | Yes      | Keystone genus (*Pinus*); 169 obs (8th most observed native); massive seed cones feed woodpeckers, jays, squirrels |


---

## 7. Site Map & Navigation

```
/ (Home)
├── Header
│   ├── Logo + site title
│   ├── Place of Interest selector (dropdown/toggle: Poway, CA | Auburn, CA)
│   └── Nav links: Plants | Calendar | About | Contribute
├── Hero section — garden overview, location context, Tallamy-inspired mission statement
├── #inventory — Plant Inventory (default view)
│   ├── Filter bar (category, keystone only, search)
│   └── Plant cards grouped by category
│       └── Expanded plant detail (inline expansion, no modals)
│           ├── Image + attribution
│           ├── Description + keystone badge + wildlife count
│           ├── Links (Calscape, iNaturalist)
│           ├── Planting requirements (sun, slope, soil)
│           ├── Maintenance tab (watering, pruning — monthly)
│           ├── Phenology tab (bloom/berry/seed timeline)
│           ├── Wildlife tab (month-by-month)
│           └── Observations tab (monthly histogram + year-over-year trend)
├── #calendar — Garden Calendar
│   ├── Month selector or horizontal scroll
│   ├── "This Month" summary across all plants for the active region
│   │   ├── Wildlife to Look For (deduped by species, Common/Uncommon/Rare via live iNaturalist obs data)
│   │   └── Maintenance (two-column: Watering frequencies | Pruning tasks)
├── #about — About the Garden
│   ├── Why native plants matter (Tallamy's food web thesis)
│   ├── The local ecosystem (dynamically rendered per Place of Interest)
│   └── How to start your own habitat garden
├── #contribute — Contribute
│   ├── How to suggest a new plant or region
│   ├── Link to GitHub repo (issues, PRs)
│   └── Brief explanation of the add-plant and add-city workflows
└── Footer
    ├── Data sources & credits (iNaturalist, Calscape, NWF, Tallamy)
    ├── GitHub repo link + license badge (CC BY-NC-SA 4.0)
    ├── Copyright notice with image attribution disclaimer
    └── Refresh Data button (clears localStorage cache)
```

**Single-page application** — all content on one page with smooth-scroll navigation anchors. No multi-page routing needed for the initial release.

---

## 8. Visual Design Direction


| Aspect               | Guidance                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Palette**          | Earth tones — sage green, warm sand, terracotta, oak brown, sky blue accent                                            |
| **Typography**       | Clean sans-serif body (system font stack or Inter); serif or slab-serif for headings for a naturalist/field-guide feel |
| **Card design**      | Rounded corners, subtle shadows, generous whitespace. Keystone species cards get a subtle gold/amber border or badge.  |
| **Icons**            | Simple line icons for wildlife types, sun/water indicators, bloom colors                                               |
| **Imagery**          | Full-bleed hero image of a native landscape; plant images in consistent aspect ratio cards                             |
| **Region indicator** | The active Place of Interest name + ecosystem type visible in the header and hero at all times                         |
| **Dark mode**        | Stretch goal — CSS custom properties make this straightforward                                                         |


---

## 9. Licensing & Contribution

### 9.1 License

The project is licensed under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**. A `LICENSE.md` file in the repo root contains the full license terms and content attribution details.


| Aspect               | Detail                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **License**          | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)                                                          |
| **License file**     | `LICENSE.md` in repo root                                                                                                      |
| **Footer display**   | "View on GitHub · CC BY-NC-SA 4.0" link in site footer                                                                         |
| **Copyright notice** | "© 2026 Native Habitat Planner. Plant and wildlife images used under Creative Commons licenses from iNaturalist contributors." |


### 9.2 Content Attribution


| Content                                      | Source                                                                             | License                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Plant & wildlife photographs                 | iNaturalist community observations (taxa API)                                      | Per-image Creative Commons as specified by the photographer; attribution displayed alongside each photo |
| Observation data                             | iNaturalist observations API                                                       | Open data                                                                                               |
| Plant inventory, maintenance, phenology data | Manually curated from Calscape, iNaturalist, NWF, and native plant care references | CC BY-NC-SA 4.0 (this project)                                                                          |
| Keystone species designations                | National Wildlife Federation, Doug Tallamy research                                | Referenced with attribution                                                                             |


### 9.3 Contribute Section

The site includes a `#contribute` section (linked from the main nav) that explains how community members can participate:

- **Suggest a plant** — open a GitHub issue with the scientific name, region, and why it should be included
- **Suggest a new region** — open a GitHub issue with the city/state and either an iNaturalist place ID or bounding box
- **Submit a pull request** — contributors can fork the repo, use the add-plant or add-city skills, and submit a PR with new plant data
- **Report issues** — link to GitHub Issues for bug reports, data corrections, or missing attribution

The section should be brief and welcoming to non-technical users (GitHub issues are the simplest entry point) while also directing developers to the skill files for structured contribution workflows.

---

## 10. Resolved Decisions


| #   | Question                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Image hosting**               | Hotlink from iNaturalist CDN. Show skeleton/placeholder while loading. Cache locally in browser after first load. No images stored in the repo.                                                                                                                                                                                                                                                                                   |
| 2   | **Data population**             | Manual curation for all plant data, informed by Tallamy selection criteria. iNaturalist observation data fetched client-side at runtime, cached in localStorage with 7-day TTL.                                                                                                                                                                                                                                                   |
| 3   | **Plant detail layout**         | Inline expansion only — no modal overlays anywhere on the site.                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | **Calendar view scope**         | Both: garden-wide "What's happening this month" is the primary view, with drill-down to per-plant detail.                                                                                                                                                                                                                                                                                                                         |
| 5   | **Plant categories**            | Six categories: Large Tree, Large Shrub, Small Shrub, Herbaceous Perennial, Groundcover — Perennial, Groundcover — Annual. No vine or succulent categories.                                                                                                                                                                                                                                                                       |
| 6   | **Wildlife images**             | Sourced from iNaturalist under Creative Commons, same hotlink + cache strategy as plant images.                                                                                                                                                                                                                                                                                                                                   |
| 7   | **Multi-region architecture**   | One `places.json` for region metadata; one `plants-{place-id}.json` per region. Client-side JS loads the active region's data file and scopes all iNaturalist API calls to that region's geographic scope (`place_id` or bounding box).                                                                                                                                                                                           |
| 10  | **Geographic scoping**          | Each Place of Interest can define its area via an iNaturalist `place_id` (integer — preferred, uses curated polygon boundaries) or a bounding box (4 coordinates — fallback). If both are provided, `place_id` is used for API calls and the bounding box for the "View on iNaturalist" search URL. Both Auburn (95603) and Poway use bounding boxes; future regions may use `place_id` when a suitable iNaturalist place exists. |
| 8   | **Plant selection methodology** | Tallamy-inspired: keystone species first, then wildlife-support count, then iNaturalist observation density. 3–5 species per structural category per region.                                                                                                                                                                                                                                                                      |
| 9   | **Codebase**                    | Modeled after the [SD Habitat reference project](https://github.com/chetanddesai/sd-habitat) — same HTML/CSS/JS structure, card design, tab system, and garden calendar. Extended with Place of Interest switching.                                                                                                                                                                                                               |


---

## 11. Future Enhancements (Out of Scope for V1)

- Interactive garden layout map (SVG or Canvas-based) showing plant placement
- Photo gallery from the actual garden
- Companion planting recommendations
- Water usage calculator
- Print-friendly plant care sheets
- PWA offline support
- Dark mode toggle
- Multi-language support
- Additional Places of Interest beyond the initial two
- Automated plant selection tool (enter a bounding box, get AI-recommended species)
- Integration with native plant nursery databases for local availability
- Tallamy "food web score" calculator — input your existing plants, get a score and recommendations

---

## 12. Success Criteria

- Poway, CA inventory: 20 plants populated with complete data
- Auburn, CA inventory: 20 plants populated with complete data
- Place of Interest selector switches all content and API calls correctly
- Site shell (HTML/CSS/JS, excluding off-site images) loads in < 500 KB
- Plant and wildlife images display skeleton placeholders while loading and cache in browser after first load
- Passes Lighthouse audits at target thresholds
- Works on all target browsers (§2.1)
- All plant and wildlife images properly attributed with Creative Commons compliance
- Garden calendar provides actionable "this month" guidance scoped to the active region
- A non-technical gardener can understand and use the site without instruction
- iNaturalist observation data loads at runtime for all plants in both regions and caches correctly
- Every plant in the inventory has a clear justification (keystone status or wildlife support count)
- Each structural category (Large Tree through Groundcover) is represented in both regions

---

## 13. References

- Tallamy, Doug. *Bringing Nature Home: How You Can Sustain Wildlife with Native Plants*. Timber Press, 2007.
- Tallamy, Doug. *Nature's Best Hope: A New Approach to Conservation That Starts in Your Yard*. Timber Press, 2019.
- [National Wildlife Federation — Keystone Plants by Ecoregion](https://www.nwf.org/Garden-for-Wildlife/About/Native-Plants/keystone-plants-by-ecoregion)
- [Calscape — California Native Plant Society](https://calscape.org/)
- [iNaturalist API Documentation](https://api.inaturalist.org/v1/docs/)
- [SD Habitat — Reference Implementation](https://github.com/chetanddesai/sd-habitat)

