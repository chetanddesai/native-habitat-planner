---
name: add-city
description: >-
  Add a new city / Place of Interest to the Native Habitat Planner. Runs through
  the full plant selection algorithm (PRD §5): identifies the local ecosystem,
  queries iNaturalist for hyperlocal native plants, ranks by keystone status and
  wildlife support, selects 3–5 species per structural category, then delegates
  to the add-plant skill to build each JSON entry. Use when the user wants to add
  a new city, add a new region, add a new Place of Interest, or mentions a location
  they want plant recommendations for.
---

# Add a New City (Place of Interest)

## Overview

This skill orchestrates the full workflow for onboarding a new geographic region:

1. Gather city/region info and geographic scope (iNaturalist `place_id` or bounding box)
2. Identify the local ecosystem
3. Run the Tallamy-inspired plant selection algorithm (PRD §5) for each structural category
4. Present the candidate plant list for user approval
5. Create the Place of Interest entry in `data/places.json`
6. Create `data/plants-{place-id}.json` and populate it using the **add-plant** skill for each selected species
7. Update site references (PRD, README, index.html)

---

## Prerequisites

Confirm with the user:

1. **City and state** (required — e.g., "Sacramento, CA")
2. **Geographic scope** (required — at least one of the following):
   - **iNaturalist `place_id`** (preferred) — An integer ID for a named place on iNaturalist. This uses iNaturalist's curated polygon boundary, which is more precise than a rectangle. Examples: `place_id=5299` (Auburn State Recreation Area), `place_id=962` (San Diego County).
     - Find it on the iNaturalist website: search for a place at `https://www.inaturalist.org/observations?place_id=` — the `place_id` appears in the URL
     - Or use the API: `https://api.inaturalist.org/v1/places/autocomplete?q=PLACE_NAME` — the `id` field in results is the `place_id`
   - **Bounding box** (fallback) — Four coordinates: `nelat`, `nelng`, `swlat`, `swlng`. Use when no suitable iNaturalist place exists or a custom rectangular area is needed.
     - Go to https://www.openstreetmap.org, search for the city, and note the bounding box from the URL
     - Or ask the user to draw a box on Google Maps and read the corner coordinates
   - **Both** — If both are provided, `place_id` is used for API calls (polygon precision) and the bounding box is used for the "View on iNaturalist" search URL fallback.
3. **Target plant count per category** — default is 3–5 per category (the user may want fewer for a smaller garden or more for a larger project). Confirm the target.

---

## Workflow

```
- [ ] Phase 1: Setup — gather city info, geographic scope (place_id or bbox), ecosystem
- [ ] Phase 2: Discovery — query iNaturalist + Calscape for candidate plants
- [ ] Phase 3: Selection — rank candidates and select top species per category
- [ ] Phase 4: Approval — present the list to the user for review
- [ ] Phase 5: Place of Interest entry — add to data/places.json
- [ ] Phase 6: Plant data — create data/plants-{place-id}.json using add-plant skill
- [ ] Phase 7: Site updates — update PRD, README, index.html
- [ ] Phase 8: Verification — test locally
```

---

### Phase 1: Setup

#### 1a. Derive the Place ID

Format: `{city}-{state}` lowercased with hyphens. Examples: `poway-ca`, `auburn-ca`, `sacramento-ca`, `portland-or`.

#### 1b. Identify the Local Ecosystem

Use web search or ecological references to identify the dominant native plant community for the area. Common California ecosystems:

| Ecosystem | Typical Regions |
|---|---|
| Coastal Sage Scrub | San Diego, Orange County, parts of LA coast |
| Chaparral | Inland Southern California foothills |
| Oak Woodland / Savanna | Central Valley foothills, Sierra foothills |
| Riparian Woodland | Along rivers and streams statewide |
| Mixed Evergreen Forest | Northern California coast, Bay Area hills |
| Redwood Forest | North Coast, Santa Cruz Mountains |
| Central Valley Grassland | Sacramento Valley, San Joaquin Valley floor |
| Montane Forest | Sierra Nevada mid-elevations |
| Desert Scrub | Eastern slopes, Mojave, Colorado Desert |

Write a 2–3 sentence `ecosystemDescription` covering:
- What the habitat type is
- Why it's ecologically important or threatened
- Why backyard habitat gardens matter here

#### 1c. Look Up iNaturalist Place ID (if not provided)

If the user provides a place name but not a `place_id`, look it up:

```bash
curl -s "https://api.inaturalist.org/v1/places/autocomplete?q=PLACE_NAME&per_page=5" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data.get('results', []):
    print(f'  place_id={r[\"id\"]:>6d} | {r[\"display_name\"]} | bbox_area={r.get(\"bbox_area\",\"?\")}')
"
```

Pick the most appropriate result. Prefer places with a reasonable `bbox_area` (city-level, not county or state). Common place types on iNaturalist: cities, counties, state parks, recreation areas, open space preserves.

#### 1d. Verify the Geographic Scope

Run a quick iNaturalist query to confirm the scope returns plant observations. Use whichever mode applies:

**If using `place_id`:**
```bash
curl -s "https://api.inaturalist.org/v1/observations/species_counts?place_id=PLACE_ID&iconic_taxa=Plantae&quality_grade=research&per_page=5" | python3 -c "
import json, sys
data = json.load(sys.stdin)
total = data.get('total_results', 0)
print(f'Total plant species observed in place: {total}')
for r in data.get('results', [])[:5]:
    t = r.get('taxon', {})
    print(f'  {t.get(\"name\",\"?\")} ({t.get(\"preferred_common_name\",\"?\")}) — {r.get(\"count\",0)} obs')
"
```

**If using bounding box:**
```bash
curl -s "https://api.inaturalist.org/v1/observations/species_counts?nelat=NELAT&nelng=NELNG&swlat=SWLAT&swlng=SWLNG&iconic_taxa=Plantae&quality_grade=research&per_page=5" | python3 -c "
import json, sys
data = json.load(sys.stdin)
total = data.get('total_results', 0)
print(f'Total plant species observed in bounding box: {total}')
for r in data.get('results', [])[:5]:
    t = r.get('taxon', {})
    print(f'  {t.get(\"name\",\"?\")} ({t.get(\"preferred_common_name\",\"?\")}) — {r.get(\"count\",0)} obs')
"
```

If `total_results` is < 50, the scope may be too small — suggest expanding it or using a broader place. If > 5000, it may be too large or cover diverse ecosystems — suggest narrowing.

---

### Phase 2: Discovery — Find Candidate Plants

For each structural category, query iNaturalist and cross-reference with keystone genera and Calscape.

#### 2a. Keystone Genera to Prioritize

These genera are the starting point. For each category, look for species in these genera that have observations in the bounding box:

**Large Tree keystone genera:** *Quercus* (oaks), *Salix* (willows), *Populus* (cottonwoods), *Acer* (maples), *Betula* (birches), *Pinus* (pines), *Prunus* (wild cherries/plums)

**Large Shrub keystone genera:** *Heteromeles* (toyon), *Sambucus* (elderberries), *Ceanothus* (California lilacs), *Arctostaphylos* (manzanitas), *Baccharis* (coyote brush), *Prunus* (wild plums), *Ribes* (currants), *Salix* (smaller willows)

**Small Shrub keystone genera:** *Eriogonum* (buckwheats), *Salvia* (sages), *Artemisia* (sagebrush), *Ribes* (currants/gooseberries), *Ceanothus* (smaller species)

**Herbaceous Perennial keystone genera:** *Asclepias* (milkweeds), *Solidago* (goldenrods), *Symphyotrichum* / *Aster* (asters), *Lupinus* (perennial lupines)

**Groundcover keystone genera:** *Lupinus* (annual lupines), *Eriogonum* (mat-forming buckwheats)

#### 2b. Query iNaturalist for Top Observed Native Plants

For each category, run a species_counts query filtered to relevant taxa. Use `iconic_taxa=Plantae` and filter by observation count to find what actually grows in the area.

Build the geographic parameter string based on the place's scope:
- If `place_id` is available: `GEO_PARAM="place_id=PLACE_ID"`
- If using bounding box: `GEO_PARAM="nelat=NELAT&nelng=NELNG&swlat=SWLAT&swlng=SWLNG"`

```bash
curl -s "https://api.inaturalist.org/v1/observations/species_counts?${GEO_PARAM}&iconic_taxa=Plantae&quality_grade=research&per_page=200&native=true" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Total native plant species: {data.get(\"total_results\", 0)}')
for r in data.get('results', []):
    t = r.get('taxon', {})
    rank = t.get('rank', '')
    if rank == 'species':
        name = t.get('name', '?')
        common = t.get('preferred_common_name', '?')
        count = r.get('count', 0)
        tid = t.get('id', 0)
        print(f'{count:5d} obs | {name} ({common}) | taxon_id={tid}')
" 2>/dev/null | head -80
```

This gives you the most-observed native plant species in the region. From this list, you'll identify candidates for each category.

#### 2c. Categorize the Candidates

For each species from the iNaturalist results, determine its structural category. You can check this by:

1. **Calscape** — search for the species on calscape.org; the plant type is listed on the profile page
2. **iNaturalist taxon page** — check the "About" or "Taxonomy" tab for growth form
3. **Web search** — "[species name] growth form height" to determine tree vs. shrub vs. groundcover

Categorize each candidate into one of:
- `large-tree` — Trees > 15 ft mature height
- `large-shrub` — Shrubs 6–15 ft mature height
- `small-shrub` — Shrubs < 6 ft mature height
- `herbaceous-perennial` — Non-woody perennials
- `groundcover-perennial` — Low-growing perennials (< 1 ft)
- `groundcover-annual` — Annual wildflowers, grasses

#### 2d. Look Up Wildlife Support on Calscape

For each candidate species, check the Calscape page for the "Wildlife supported" count. This is the number of wildlife species that use the plant.

```
https://calscape.org/GENUS-SPECIES-(Common-Name)
```

Record the wildlife support count for ranking in Phase 3. If a plant doesn't have a Calscape page (non-California native, or very rare species), deprioritize it — Calscape data is essential for the add-plant skill to populate maintenance, bloom, and wildlife fields.

---

### Phase 3: Selection — Rank and Select

For each structural category, rank all candidates using this priority:

```
PRIORITY 1 — Keystone status
  Species whose genus appears in the NWF keystone genera list (§5.2 of PRD) rank first.

PRIORITY 2 — Wildlife species supported (Calscape count)
  Among species at the same keystone tier, the one with the highest Calscape
  wildlife-supported count ranks higher.

PRIORITY 3 — iNaturalist observation count in the geographic scope
  As a tiebreaker and confirmation of hyperlocal presence. Higher observation
  count = more established local population = better candidate.
```

**Selection targets per category:**

| Category | Target Count | Notes |
|---|---|---|
| Large Tree | 3–4 | At least 2 keystone genera (ideally an oak + one other) |
| Large Shrub | 4–5 | Mix of keystone shrubs; include at least 1 berry-producing species for birds |
| Small Shrub | 4–5 | Prioritize pollinator-supporting species (sages, buckwheats) |
| Herbaceous Perennial | 3–4 | Must include a milkweed (*Asclepias*) for Monarch butterflies |
| Groundcover — Perennial | 1–2 | |
| Groundcover — Annual | 1–2 | Include at least 1 spring wildflower |

**Total target: 15–22 plants per Place of Interest.**

#### Selection Checklist for Each Candidate

Before finalizing a species, verify:

- [ ] Has at least 1 iNaturalist observation in the geographic scope (hyperlocal confirmation)
- [ ] Has a Calscape page with planting requirements, bloom data, and wildlife info
- [ ] Has a valid iNaturalist taxon ID
- [ ] Is not a cultivar or non-native variety
- [ ] Does not duplicate a genus already selected for this category (aim for genus diversity — e.g., don't select 3 *Quercus* for Large Tree unless the region truly has no other keystone tree genera)

#### Genus Diversity Rule

Within each category, avoid selecting more than 2 species from the same genus **unless** there are fewer than 3 keystone genera available for that category in the region. Diversity of genera = diversity of caterpillar species supported = larger food web.

---

### Phase 4: Approval — Present to the User

Before creating any data files, present the full candidate list to the user in this format:

```markdown
## Proposed Plant Inventory for {City, State}

**Ecosystem:** {ecosystem name}
**Geographic scope:** {place_id=N and/or bounding box coordinates}

### Large Trees (N selected)
| # | Scientific Name | Common Name | Keystone | Wildlife Spp. | iNat Obs | Rationale |
|---|---|---|---|---|---|---|
| 1 | *Quercus lobata* | Valley Oak | Yes | 334 | 1,247 | Keystone oak; highest wildlife support |
| ... | ... | ... | ... | ... | ... | ... |

### Large Shrubs (N selected)
...

### Small Shrubs (N selected)
...

### Herbaceous Perennials (N selected)
...

### Groundcover (N selected)
...

**Total: N plants**
```

Wait for the user to:
- Approve the list as-is
- Request additions, removals, or substitutions
- Adjust the number of species per category

Do NOT proceed to Phase 5 until the user approves.

---

### Phase 5: Create the Place of Interest Entry

#### 5a. Add to `data/places.json`

Read the existing `data/places.json` and append a new entry:

```json
{
  "id": "{place-id}",
  "name": "{City, State full name}",
  "shortName": "{City, ST}",
  "ecosystem": "{Ecosystem Name}",
  "ecosystemDescription": "{2-3 sentence description}",
  "iNaturalistPlaceId": null,
  "boundingBox": {
    "nelat": ...,
    "nelng": ...,
    "swlat": ...,
    "swlng": ...
  },
  "plantDataFile": "plants-{place-id}.json",
  "heroDescription": "A living guide to California native plants selected for maximum wildlife impact in {City}'s {ecosystem} — keystone species first, then the plants that support the most birds, butterflies, and pollinators.",
  "aboutSections": {
    "whyNative": "California's native plants have co-evolved with local wildlife for thousands of years. They require less water, no fertilizers, and no pesticides — while supporting 10–50× more wildlife than non-native alternatives. A single native oak supports over 300 species of insects, birds, and mammals.",
    "ecosystem": "{Ecosystem description tailored to this region}",
    "getStarted": "{Specific getting-started advice for this region, mentioning 3-4 keystone species from the approved list}"
  }
}
```

#### 5b. Create the empty plant data file

Create `data/plants-{place-id}.json` with an empty array:

```json
[]
```

---

### Phase 6: Populate Plant Data — Using the Add-Plant Skill

For each approved plant, execute the **add-plant** skill (`.cursor/skills/add-plant/SKILL.md`). The add-plant skill handles:

- Researching the plant (Calscape, iNaturalist, web search)
- Finding the iNaturalist taxon ID
- Building the full JSON entry (maintenance, phenology, wildlife, etc.)
- Inserting into `data/plants-{place-id}.json`
- Verifying wildlife image and observation searchability

**Important:** When invoking add-plant for each species, provide:

1. **Place of Interest**: `{place-id}`
2. **Scientific name**: from the approved list
3. **Common name(s)**: from the approved list
4. **Category**: from the approved list

Process plants in category order (Large Tree → Large Shrub → Small Shrub → Herbaceous Perennial → Groundcover) so the JSON file is loosely organized.

#### Batch Efficiency Tips

- Look up all iNaturalist taxon IDs in a batch before starting individual plant entries
- Calscape pages can be checked in parallel for wildlife support counts, bloom data, etc.
- Wildlife species naming validation (Step 7 of add-plant) can be batched across all plants

---

### Phase 7: Site Updates

After all plants are added, update references across the site:

#### `docs/PRD.md`

1. Add a new subsection under **§6 Starting Plant Inventories**: `### 6.N {City, State} — {Ecosystem}` with the full plant table (matching the format of existing entries)
2. Update **§3.0 Place of Interest Selector** — add the new region to the "Starting Places of Interest" table
3. Update **§4.1** — add the new place entry to the `places.json` example if appropriate
4. Update **§11 Success Criteria** — add a line for the new region's plant count

#### `README.md`

Update the features section to mention the new region.

#### `index.html`

If the Place of Interest selector is hardcoded in HTML (rather than generated from `places.json`), add the new option.

#### `data/places.json`

Already done in Phase 5.

---

### Phase 8: Verification

1. Start the local dev server if not running: `npx http-server . -p 8090 -c-1`
2. Open the site and select the new Place of Interest from the header selector
3. Verify:
   - [ ] The hero text and ecosystem description update correctly
   - [ ] All plants appear in the inventory under the correct categories
   - [ ] Each plant card expands to show all 4 tabs
   - [ ] Plant images load from iNaturalist (no broken placeholders)
   - [ ] Wildlife images load on the Wildlife tab for each plant
   - [ ] The Garden Calendar shows correct maintenance, phenology, and wildlife data
   - [ ] Observation data loads for all plants (check the Observations tab)
   - [ ] The "About" section reflects the new region's ecosystem
   - [ ] Switching between regions works without errors
   - [ ] The browser console shows no errors

---

## Reference: Keystone Genera Quick-Lookup

When researching candidates, check if the genus is in this list. If yes, mark `isKeystone: true` and sort it to the top.

| Genus | Common Name |
|---|---|
| *Quercus* | Oaks |
| *Salix* | Willows |
| *Prunus* | Wild plums, cherries |
| *Betula* | Birches |
| *Populus* | Cottonwoods, aspens |
| *Acer* | Maples |
| *Pinus* | Pines |
| *Ceanothus* | California Lilacs |
| *Arctostaphylos* | Manzanitas |
| *Baccharis* | Coyote Brush |
| *Eriogonum* | Buckwheats |
| *Solidago* | Goldenrods |
| *Symphyotrichum* | Asters |
| *Lupinus* | Lupines |
| *Asclepias* | Milkweeds |
| *Artemisia* | Sagebrush |
| *Salvia* | Sages |
| *Heteromeles* | Toyon |
| *Ribes* | Currants, gooseberries |
| *Sambucus* | Elderberries |

## Reference: iNaturalist API Endpoints Used

All geographic endpoints accept **either** `place_id=N` **or** bounding box coordinates (`nelat`, `nelng`, `swlat`, `swlng`). Use `place_id` when available (polygon precision); bounding box as fallback.

| Endpoint | Purpose |
|---|---|
| `GET /v1/observations/species_counts?place_id=N&iconic_taxa=Plantae&native=true&quality_grade=research&per_page=200` | Discover most-observed native plants in an iNaturalist place |
| `GET /v1/observations/species_counts?nelat=...&nelng=...&swlat=...&swlng=...&iconic_taxa=Plantae&native=true&quality_grade=research&per_page=200` | Same, using bounding box (fallback) |
| `GET /v1/taxa?q=SCIENTIFIC_NAME&per_page=1&is_active=true` | Look up taxon ID for a specific species |
| `GET /v1/observations/histogram?taxon_id=ID&place_id=N&interval=month_of_year&d1=YYYY-01-01` | Monthly observation histogram for a species in a place |
| `GET /v1/observations/histogram?taxon_id=ID&nelat=...&swlat=...&interval=month_of_year&d1=YYYY-01-01` | Same, using bounding box (fallback) |
| `GET /v1/places/autocomplete?q=PLACE_NAME` | Look up a place and its `place_id`, name, and bounding box |

## Reference: Category Targets Summary

| Category | Target | Must Include |
|---|---|---|
| `large-tree` | 3–4 | At least 2 keystone genera (oak + 1 other) |
| `large-shrub` | 4–5 | At least 1 berry producer for birds |
| `small-shrub` | 4–5 | Prioritize pollinator plants (sages, buckwheats) |
| `herbaceous-perennial` | 3–4 | Must include *Asclepias* (milkweed) for Monarchs |
| `groundcover-perennial` | 1–2 | |
| `groundcover-annual` | 1–2 | At least 1 spring wildflower |
| **Total** | **15–22** | |
