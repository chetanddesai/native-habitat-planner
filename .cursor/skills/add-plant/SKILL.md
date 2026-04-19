---
name: add-plant
description: >-
  Add a new native plant to the Native Habitat Planner website for a specific
  Place of Interest. Handles all steps: researching the plant, creating the JSON
  entry in data/plants-{place-id}.json, looking up the iNaturalist taxon ID,
  updating plant counts across index.html / README.md / docs/PRD.md, and verifying
  the result. Observation data is fetched at runtime. Use when the user wants to
  add a plant, add a species, expand the inventory, or mentions a new plant they
  want on the site.
---

# Add a New Plant to Native Habitat Planner

## Prerequisites

Before starting, confirm with the user:
1. **Place of Interest** (required — which region is this plant for? e.g., `poway-ca`, `auburn-ca`)
2. **Scientific name** (required — everything else can be researched)
3. **Common name(s)** (if the user doesn't provide them, look them up on Calscape or iNaturalist)
4. **Category** — ask the user to pick from: `large-tree`, `large-shrub`, `small-shrub`, `herbaceous-perennial`, `groundcover-perennial`, `groundcover-annual`

## Workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Identify the Place of Interest and its bounding box
- [ ] Step 2: Research the plant
- [ ] Step 3: Find the iNaturalist taxon ID and verify local presence
- [ ] Step 4: Build the JSON entry
- [ ] Step 5: Insert into data/plants-{place-id}.json
- [ ] Step 6: Bump version strings (DATA_VERSION + index.html asset versions)
- [ ] Step 7: Update plant counts across the site
- [ ] Step 8: Verify wildlife image & observation searchability
- [ ] Step 9: Verify locally
```

---

### Step 1: Identify the Place of Interest and Its Geographic Scope

Read `data/places.json` to find the target region's geographic scope. Each place may have an `iNaturalistPlaceId` (preferred for API calls — uses polygon boundaries) and/or a `boundingBox` (fallback — rectangle coordinates). You'll need the scope for all iNaturalist API calls and the `searchUrl` field.

| Place ID | iNaturalist Place ID | Bounding Box |
|---|---|---|
| `poway-ca` | — (uses bounding box) | nelat: 33.0652649, nelng: -116.9575429, swlat: 32.899128, swlng: -117.103013 |
| `auburn-ca` | — (uses bounding box) | nelat: 38.986542, nelng: -120.9610799, swlat: 38.831071, swlng: -121.191049 |

**Geographic parameter for API calls:** If the place has `iNaturalistPlaceId`, use `place_id=N` in API URLs. Otherwise, use `nelat=...&nelng=...&swlat=...&swlng=...`.

### Step 2: Research the Plant

Gather this information (Calscape, iNaturalist, and web search are the primary sources):

| Field | Where to find it |
|---|---|
| Common names | Calscape page title, iNaturalist common name |
| Synonyms | Calscape "Synonyms" section or iNaturalist "Taxonomy" tab |
| Keystone status | National Wildlife Federation keystone search or Calscape "Wildlife supported" |
| Wildlife species supported | Calscape "Wildlife supported" count — the number of wildlife species this plant supports |
| Description | Write 1–2 sentences: what the plant is, its ecological role, why it matters for the garden. Focus on wildlife value and Tallamy's food-web perspective. |
| Sun / Slope / Soil | Calscape "Growing conditions" section |
| Watering schedule | Calscape water needs + common knowledge for the species. Use numeric frequencies: `0` = none, `1` = once/month, `2` = twice/month. Native plants generally need `0` Nov–Mar and `1` Jun–Sep. |
| Pruning months | Which months to prune. Derive from Calscape or native plant care guides. 1-indexed integers (1=Jan, 12=Dec). Leave as `[]` if pruning is not needed (e.g., annuals). |
| Pruning task | Short actionable summary of what to do (e.g., "Cut back by half", "Remove spent flower stalks", "Cut to ground after die-back"). |
| Pruning notes | Longer explanation of pruning approach, timing, and caveats. |
| Bloom months + colors | Calscape "Bloom" section. Months are 1-indexed integers (1=Jan, 12=Dec). |
| Berry/fruit months + colors | Calscape or general botany references. Include a `colors` array (e.g., `["red"]`). Set to `null` if the plant doesn't produce notable berries/fruit. Berry colors are displayed in the phenology chart, so accuracy matters. |
| Seed months | If applicable, when seeds are available for wildlife. Set to `null` if not notable. |
| Ecological value | 1 sentence on what the blooms/berries/seeds support (pollinators, birds, etc.) |
| Wildlife visitors | 2–4 entries of **specific, named species** that interact with this plant. Generic groups like "Native bees" or "Hover flies" belong in the description/ecologicalValue, NOT as wildlife entries. Species names must resolve on iNaturalist — they're used for both **image loading** AND **observation data fetching** in the Garden Calendar (see below). See **Wildlife Species Naming Rules** below and Activity Enums at the end. |

### Step 3: Find the iNaturalist Taxon ID and Verify Local Presence

1. Search `https://api.inaturalist.org/v1/taxa?q=SCIENTIFIC_NAME&per_page=1&is_active=true`
2. The `results[0].id` is the `taxonId`.
3. Verify the returned `name` matches the expected scientific name.
4. **Verify the species is well-observed locally** — query its observation count in the geographic scope:
   ```bash
   curl -s "https://api.inaturalist.org/v1/observations/species_counts?${GEO_PARAM}&taxon_id=TAXON_ID&quality_grade=research" | python3 -c "
   import json, sys
   data = json.load(sys.stdin)
   r = data.get('results', [])
   count = r[0]['count'] if r else 0
   print(f'Local observations: {count}')
   if count < 50:
       print('⚠️ LOW OBSERVATION COUNT — verify this is the best representative of its genus locally.')
       print('   Query all species in the genus to check for better alternatives:')
       print('   curl \"https://api.inaturalist.org/v1/observations/species_counts?\${GEO_PARAM}&taxon_name=GENUS&quality_grade=research&per_page=10\"')
   "
   ```
   If the species has < 50 observations **and** a congener or ecologically equivalent species has 3×+ more observations locally, stop and recommend the better-observed alternative to the user before proceeding.
5. Build the search URL using the region's geographic scope:
   - If the place has `iNaturalistPlaceId`: `https://www.inaturalist.org/observations?taxon_id=TAXON_ID&place_id=PLACE_ID`
   - If using bounding box: `https://www.inaturalist.org/observations?taxon_id=TAXON_ID&nelat=NELAT&nelng=NELNG&swlat=SWLAT&swlng=SWLNG`
   - If the place has both, prefer `place_id` for the search URL as it shows observations within the polygon boundary
6. Build the Calscape URL: `https://calscape.org/GENUS-SPECIES-(Common-Name)` (hyphens between words, parentheses around common name).

### Step 4: Build the JSON Entry

Use this template. All fields are required unless marked optional.

```json
{
  "id": "genus-species",
  "commonNames": ["Primary Common Name", "Alternate Name"],
  "scientificName": "Genus species",
  "synonyms": [],
  "category": "small-shrub",
  "isKeystone": false,
  "wildlifeSpeciesSupported": 0,
  "description": "...",
  "image": {
    "url": "",
    "attribution": "",
    "iNaturalistUrl": ""
  },
  "calscapeUrl": "https://calscape.org/Genus-species-(Common-Name)",
  "iNaturalistData": {
    "taxonId": 12345,
    "searchUrl": "https://www.inaturalist.org/observations?taxon_id=12345&nelat=...&nelng=...&swlat=...&swlng=..."
  },
  "plantingRequirements": {
    "sunExposure": "Full Sun",
    "slopeRequirements": "...",
    "soilRequirements": "..."
  },
  "maintenance": {
    "wateringSchedule": {
      "jan": 0, "feb": 0, "mar": 0, "apr": 0,
      "may": 1, "jun": 1, "jul": 1, "aug": 1,
      "sep": 0, "oct": 0, "nov": 0, "dec": 0
    },
    "wateringNotes": "...",
    "pruningMonths": [10, 11],
    "pruningTask": "Cut back by half to shape",
    "pruningNotes": "...",
    "specialNotes": ""
  },
  "phenology": {
    "bloom": {
      "months": [3, 4, 5],
      "colors": ["yellow"]
    },
    "berry": null,
    "seed": null,
    "ecologicalValue": "..."
  },
  "wildlife": [
    {
      "months": [3, 4, 5],
      "species": "Species name (Family or Genus)",
      "activity": "nectar-pollen",
      "notes": "Brief note on behavior",
      "image": {
        "url": "",
        "attribution": "",
        "iNaturalistUrl": ""
      }
    }
  ]
}
```

**Important conventions:**
- `id`: lowercase scientific name with hyphens, e.g. `"quercus-lobata"`
- `image`: Leave `url`, `attribution`, and `iNaturalistUrl` as empty strings — the client-side JS fetches images dynamically from the iNaturalist taxa API at runtime using the scientific name. The image object is a fallback only.
- Wildlife `image` objects: Same approach — leave empty. The JS searches iNaturalist using the **first two words** of the `species` field for images and the full name (minus parenthetical content) for observation data.
- `wildlifeSpeciesSupported`: Integer from Calscape's "Wildlife supported" count.
- **Wildlife entries must be specific, named species** — do NOT add generic group entries like "Native bees", "Hover flies", or "Bumblebees". Generic pollinator info belongs in `description` or `ecologicalValue` instead.
- Include 2–4 entries covering the major ecological interactions. Common patterns: a specific pollinator species visiting blooms, a named bird nesting, a specific butterfly as caterpillar host, a named bird eating seeds/berries.
- `wateringSchedule`: Use numeric frequencies (`0`, `1`, `2`) — **not** string values like `"none"` or `"low"`.
- `pruningMonths`: Array of 1-indexed month numbers when pruning should occur. Use `[]` if no pruning is needed.
- `pruningTask`: A short, actionable description of the pruning work. Required if `pruningMonths` is non-empty.
- `iNaturalistData.searchUrl`: Must use the **region-specific geographic scope** from `data/places.json` — either `place_id=N` or bounding box coordinates. Never hardcode coordinates.

**Wildlife Species Naming Rules (critical for image loading AND observation data):**

The species name is used in two places at runtime:
1. **Image loading** — the JS calls `species.split(' ').slice(0, 2).join(' ')` to search the iNaturalist taxa API for photos.
2. **Garden Calendar observation data** — the JS calls `species.replace(/\s*\(.*\)/, '').trim()` to query the iNaturalist histogram API for monthly observation counts in the active region. These counts drive the Common/Uncommon/Rare classification.

Both lookups must succeed. The first two words (or the name minus parenthetical content) **must** return results on iNaturalist. Follow these rules:

1. **Birds, lizards, mammals** — Use the standard common name. These almost always resolve.
   - Good: `"Anna's Hummingbird"`, `"Western Fence Lizard"`, `"Mule deer"`
2. **Butterflies/moths** — Use the proper common name WITHOUT the word "butterfly"/"moth" appended, unless it's part of the official two-word name. The first two words must be the searchable name.
   - Good: `"Common Buckeye"`, `"Painted Lady butterfly"`, `"Monarch butterfly"`
   - Bad: `"Buckeye butterfly"` (iNaturalist returns 0 results for "Buckeye butterfly")
3. **Insects with scientific names** — Put the scientific binomial FIRST, common name in parentheses. The first two words (the binomial) will be the search term.
   - Good: `"Bombus crotchii (Crotch's Bumblebee)"`, `"Xylocopa varipuncta (Valley Carpenter Bee)"`
   - Bad: `"Crotch's Bumblebee (Bombus crotchii)"` (iNaturalist returns 0 for "Crotch's Bumblebee")
4. **Never combine multiple species** in one entry.

### Step 5: Insert into data/plants-{place-id}.json

1. Read `data/plants-{place-id}.json` for the target region.
2. Append the new entry to the array (before the closing `]`).
3. Plants are loosely grouped by category in the file but the JS sorts dynamically, so exact position doesn't matter — appending to the end is fine.

### Step 6: Bump Version Strings

**Required.** The site uses version query parameters to bust browser caches on mobile. After changing any data, JS, or CSS file, increment **both**:

1. **`js/app.js`** — `DATA_VERSION` constant (busts JSON data caches):
   ```javascript
   const DATA_VERSION = '4';  // was '3' — bump on every data change
   ```

2. **`index.html`** — `?v=` query params on the CSS and JS `<link>`/`<script>` tags (busts asset caches):
   ```html
   <link rel="stylesheet" href="css/styles.css?v=3">
   <script src="js/app.js?v=3"></script>
   ```

### Step 7: Update Plant Counts

The total plant count for each region appears in several locations. Search for the old count and increment to the new count:

**`index.html`** — meta tags and hero text reference plant counts (these may be dynamic based on the loaded JSON, but verify)

**`README.md`** — Features bullet referencing plant counts

**`docs/PRD.md`** — Plant inventory tables and success criteria

### Step 8: Verify Wildlife Image & Observation Searchability

**Before** starting the dev server, validate that every wildlife `species` name resolves on iNaturalist for both images and observations. For each wildlife entry in the new plant, run:

**Image check** (uses first two words of species name):
```bash
curl -s "https://api.inaturalist.org/v1/taxa?q=FIRST+TWO+WORDS&per_page=1&is_active=true" | python3 -c "
import json, sys
data = json.load(sys.stdin)
r = data.get('results', [])
if r and r[0].get('default_photo'):
    print(f'OK: {r[0][\"name\"]} — {r[0].get(\"preferred_common_name\",\"\")}')
else:
    print('FAIL: no results or no photo — rename the species field')
"
```

**Observation check** (uses name minus parenthetical content — use the region's geographic scope):

If the place has `iNaturalistPlaceId`, use `place_id=N`:
```bash
curl -s "https://api.inaturalist.org/v1/observations/histogram?taxon_name=SPECIES_NAME&place_id=PLACE_ID&interval=month_of_year&d1=2021-01-01" | python3 -c "
import json, sys
data = json.load(sys.stdin)
m = data.get('results', {}).get('month_of_year', {})
total = sum(m.values())
if total > 0:
    print(f'OK: {total} observations across months')
else:
    print('WARN: 0 observations in region — species will appear as Rare in the Garden Calendar')
"
```

If using bounding box:
```bash
curl -s "https://api.inaturalist.org/v1/observations/histogram?taxon_name=SPECIES_NAME&nelat=NELAT&nelng=NELNG&swlat=SWLAT&swlng=SWLNG&interval=month_of_year&d1=2021-01-01" | python3 -c "
import json, sys
data = json.load(sys.stdin)
m = data.get('results', {}).get('month_of_year', {})
total = sum(m.values())
if total > 0:
    print(f'OK: {total} observations across months')
else:
    print('WARN: 0 observations in region — species will appear as Rare in the Garden Calendar')
"
```

### Step 9: Verify Locally

1. Start the local dev server if not running: `npx http-server . -p 8090 -c-1`
2. Switch to the target Place of Interest in the header selector
3. Check:
   - New plant card appears in the inventory under the correct category
   - Expanding the card shows all 4 tabs (Maintenance, Bloom & Seeds, Wildlife, Observations)
   - **Wildlife tab**: every species entry loads a photo (no broken image placeholders)
   - The phenology chart includes the new plant row
   - The observation trends section has a sparkline card for the new plant
   - The garden calendar shows the plant in the appropriate months
   - **Garden Calendar wildlife**: navigate to a month where the new plant's wildlife is active

---

## Reference: Enum Values

### Category
| Value | Display |
|---|---|
| `large-tree` | Large Tree |
| `large-shrub` | Large Shrub |
| `small-shrub` | Small Shrub |
| `herbaceous-perennial` | Herbaceous Perennial |
| `groundcover-perennial` | Groundcover — Perennial |
| `groundcover-annual` | Groundcover — Annual |

### Wildlife Activity
| Value | Display |
|---|---|
| `nectar-pollen` | Nectar / Pollen Foraging |
| `eating-seeds` | Eating Seeds |
| `eating-berries` | Eating Berries |
| `nesting` | Nesting |
| `caterpillar-host` | Caterpillar Host Plant |
| `shelter` | Shelter / Roosting |
| `browsing` | Browsing Foliage |

### Watering Frequencies
`0` = none | `1` = 1×/month | `2` = 2×/month (numeric integers, not strings)

### Geographic Scopes (from data/places.json)
```
Poway, CA:    iNaturalistPlaceId: null
              boundingBox: nelat: 33.0652649, nelng: -116.9575429, swlat: 32.899128, swlng: -117.103013

Auburn, CA:   iNaturalistPlaceId: null (uses bounding box)
              boundingBox: nelat: 38.986542, nelng: -120.9610799, swlat: 38.831071, swlng: -121.191049
```

When `iNaturalistPlaceId` is set, use `place_id=N` in API calls (polygon precision).
When null, use the bounding box coordinates (`nelat`, `nelng`, `swlat`, `swlng`).
