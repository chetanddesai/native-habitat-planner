/* ============================================================
   Native Habitat Planner — Application
   Multi-region support with Tallamy-inspired plant selection
   ============================================================ */
(function () {
  'use strict';

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const CATEGORY_ORDER = [
    'large-tree','large-shrub','small-shrub',
    'herbaceous-perennial','groundcover-perennial','groundcover-annual'
  ];
  const CATEGORY_LABELS = {
    'large-tree': 'Large Trees',
    'large-shrub': 'Large Shrubs',
    'small-shrub': 'Small Shrubs',
    'herbaceous-perennial': 'Herbaceous Perennials',
    'groundcover-perennial': 'Groundcover — Perennial',
    'groundcover-annual': 'Groundcover — Annual'
  };
  const ACTIVITY_LABELS = {
    'nectar-pollen': 'Nectar / Pollen',
    'eating-seeds': 'Eating Seeds',
    'eating-berries': 'Eating Berries',
    'nesting': 'Nesting',
    'caterpillar-host': 'Caterpillar Host',
    'shelter': 'Shelter / Roosting',
    'browsing': 'Browsing'
  };
  const WATER_LABELS = { 0: '—', 1: '1×', 2: '2×', 3: '3×', 4: '4×' };
  const COLOR_MAP = {
    'white': '#f5f5f0', 'pink': '#f0a0b0', 'red': '#d44040', 'orange': '#e8833a',
    'orange-red': '#e05530', 'yellow': '#f0d040', 'yellow-green': '#b8cc50',
    'blue': '#5588cc', 'purple': '#8855aa', 'lavender': '#b0a0d0',
    'pale-blue': '#a0c0e0', 'rust': '#b06030', 'brown': '#8b6b4a',
    'green': '#6a9b5a', 'cream': '#f5f0d0'
  };
  const SEED_STRIPE = 'repeating-linear-gradient(135deg,#c8b48a,#c8b48a 3px,#bfa97a 3px,#bfa97a 5px)';
  const LIGHT_BG_COLORS = new Set(['white','yellow','yellow-green','pink','pale-blue','lavender','orange','cream']);

  // ---- Region Manager State ----
  const state = {
    places: [],
    activePlace: null,
    plants: [],
    plantsByRegion: {},
    currentMonth: new Date().getMonth() // 0-indexed
  };

  function buildGeoParams(place) {
    if (place.iNaturalistPlaceId) {
      return `place_id=${place.iNaturalistPlaceId}`;
    }
    const bb = place.boundingBox;
    return `nelat=${bb.nelat}&nelng=${bb.nelng}&swlat=${bb.swlat}&swlng=${bb.swlng}`;
  }

  // ---- Helpers ----
  function phenoCellData(ph, m) {
    const bloomSet = new Set(ph.bloom ? ph.bloom.months : []);
    const berrySet = new Set(ph.berry ? ph.berry.months : []);
    const seedSet  = new Set(ph.seed  ? ph.seed.months  : []);
    if (bloomSet.has(m)) {
      const names = ph.bloom.colors || [];
      const hexes = names.map(c => COLOR_MAP[c] || c);
      let bg;
      if (hexes.length <= 1) { bg = hexes[0] || '#ccc'; }
      else {
        const pct = 100 / hexes.length;
        bg = 'linear-gradient(135deg,' + hexes.map((c, j) =>
          `${c} ${j * pct}%,${c} ${(j + 1) * pct}%`).join(',') + ')';
      }
      return { bg, phase: 'bloom', light: names.length > 0 && LIGHT_BG_COLORS.has(names[0]) };
    }
    if (berrySet.has(m)) {
      const names = ph.berry.colors || [];
      const hexes = names.map(c => COLOR_MAP[c] || c);
      return { bg: hexes[0] || COLOR_MAP['red'], phase: 'berry', light: names.length > 0 && LIGHT_BG_COLORS.has(names[0]) };
    }
    if (seedSet.has(m)) {
      return { bg: SEED_STRIPE, phase: 'seed', light: true };
    }
    return { bg: null, phase: 'empty', light: true };
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ---- Cache infrastructure (7-day TTL, region-scoped) ----
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const CACHE_TS_KEY = 'nhp-cache-ts';
  const PLACE_PREF_KEY = 'nhp-active-place';
  const WL_OBS_CACHE_KEY = 'nhp-wl-obs-v1';
  const PLANT_OBS_CACHE_KEY = 'nhp-plant-obs-v1';
  const IMAGE_CACHE_KEY = 'nhp-img-cache-v1';

  function getCacheTimestamp() {
    return parseInt(localStorage.getItem(CACHE_TS_KEY), 10) || 0;
  }
  function setCacheTimestamp() {
    const now = Date.now();
    try { localStorage.setItem(CACHE_TS_KEY, String(now)); } catch {}
    updateCacheStatusUI(now);
  }
  function isCacheExpired() {
    return (Date.now() - getCacheTimestamp()) > CACHE_TTL_MS;
  }
  function clearAllCaches() {
    wlObsCache = {};
    plantObsCache = {};
    imageCache = {};
    try {
      localStorage.removeItem(WL_OBS_CACHE_KEY);
      localStorage.removeItem(PLANT_OBS_CACHE_KEY);
      localStorage.removeItem(IMAGE_CACHE_KEY);
      localStorage.removeItem(CACHE_TS_KEY);
    } catch {}
    updateCacheStatusUI(0);
  }
  function updateCacheStatusUI(ts) {
    const el = document.getElementById('cache-status');
    if (!el) return;
    if (!ts) {
      el.textContent = 'iNaturalist data: not yet fetched';
    } else {
      const d = new Date(ts);
      el.textContent = `iNaturalist data cached: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  // ---- iNaturalist Observation Data (runtime, cached with region-scoped keys) ----
  const INAT_HIST_API = 'https://api.inaturalist.org/v1/observations/histogram';
  const LOOKBACK_YEARS = 5;

  let wlObsCache = (() => { try { return JSON.parse(localStorage.getItem(WL_OBS_CACHE_KEY)) || {}; } catch { return {}; } })();
  let plantObsCache = (() => { try { return JSON.parse(localStorage.getItem(PLANT_OBS_CACHE_KEY)) || {}; } catch { return {}; } })();

  function obsD1() { return (new Date().getFullYear() - LOOKBACK_YEARS) + '-01-01'; }

  async function fetchWildlifeObs(speciesName) {
    const placeId = state.activePlace?.id || 'unknown';
    const cleanName = speciesName.replace(/\s*\(.*\)/, '').trim();
    const cacheKey = `${placeId}:${cleanName}`;
    if (!isCacheExpired() && wlObsCache[cacheKey]) return wlObsCache[cacheKey];
    try {
      const geoParams = buildGeoParams(state.activePlace);
      const resp = await fetch(`${INAT_HIST_API}?taxon_name=${encodeURIComponent(cleanName)}&${geoParams}&interval=month_of_year&d1=${obsD1()}`);
      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();
      const monthly = data.results?.month_of_year || {};
      wlObsCache[cacheKey] = monthly;
      try { localStorage.setItem(WL_OBS_CACHE_KEY, JSON.stringify(wlObsCache)); } catch {}
      setCacheTimestamp();
      return monthly;
    } catch { return wlObsCache[cacheKey] || {}; }
  }

  function computeFrequency(total) {
    if (total >= 200) return 'common';
    if (total >= 50) return 'uncommon';
    return 'rare';
  }

  async function fetchPlantObs(taxonId) {
    const placeId = state.activePlace?.id || 'unknown';
    const cacheKey = `${placeId}:${taxonId}`;
    if (!isCacheExpired() && plantObsCache[cacheKey]) return plantObsCache[cacheKey];
    try {
      const d1 = obsD1();
      const geoParams = buildGeoParams(state.activePlace);
      const [monthResp, yearResp] = await Promise.all([
        fetch(`${INAT_HIST_API}?taxon_id=${taxonId}&${geoParams}&interval=month_of_year&d1=${d1}`),
        fetch(`${INAT_HIST_API}?taxon_id=${taxonId}&${geoParams}&interval=year&d1=${d1}`)
      ]);
      if (!monthResp.ok || !yearResp.ok) throw new Error('API error');
      const [monthData, yearData] = await Promise.all([monthResp.json(), yearResp.json()]);

      const monthResults = monthData.results?.month_of_year || {};
      const byMonth = {};
      for (let m = 1; m <= 12; m++) byMonth[MONTH_KEYS[m - 1]] = monthResults[m] || 0;

      const yearResults = yearData.results?.year || {};
      const byYear = {};
      for (const [dateStr, count] of Object.entries(yearResults)) {
        const y = dateStr.slice(0, 4);
        byYear[y] = (byYear[y] || 0) + count;
      }

      const total = Object.values(byMonth).reduce((s, v) => s + v, 0);
      const result = { observationsByMonth: byMonth, observationsByYear: byYear, totalObservations: total, frequency: computeFrequency(total) };
      plantObsCache[cacheKey] = result;
      try { localStorage.setItem(PLANT_OBS_CACHE_KEY, JSON.stringify(plantObsCache)); } catch {}
      setCacheTimestamp();
      return result;
    } catch { return plantObsCache[cacheKey] || { observationsByMonth: {}, observationsByYear: {}, totalObservations: 0, frequency: 'rare' }; }
  }

  // ---- iNaturalist Image Loading (shared across regions) ----
  const INAT_TAXA_API = 'https://api.inaturalist.org/v1/taxa';
  const CONCURRENT_FETCHES = 3;

  let imageCache = (() => { try { return JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY)) || {}; } catch { return {}; } })();
  let fetchQueue = [];
  let activeFetches = 0;

  function saveImageCache() {
    try { localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(imageCache)); } catch {}
    setCacheTimestamp();
  }

  function queueImageFetch(img) {
    const name = img.dataset.species;
    if (!name) return;
    if (imageCache[name]) {
      applyImage(img, imageCache[name]);
      return;
    }
    fetchQueue.push(img);
    processQueue();
  }

  function processQueue() {
    while (activeFetches < CONCURRENT_FETCHES && fetchQueue.length > 0) {
      const img = fetchQueue.shift();
      activeFetches++;
      fetchTaxonImage(img).finally(() => { activeFetches--; processQueue(); });
    }
  }

  async function fetchTaxonImage(img) {
    const species = img.dataset.species;
    const searchName = species.split(' ').slice(0, 2).join(' ');
    try {
      const resp = await fetch(`${INAT_TAXA_API}?q=${encodeURIComponent(searchName)}&per_page=1&is_active=true`);
      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const taxon = data.results[0];
        if (taxon.default_photo) {
          const photoData = {
            url: (taxon.default_photo.medium_url || taxon.default_photo.url || '').replace('square', 'medium'),
            attribution: taxon.default_photo.attribution || '',
            inatUrl: `https://www.inaturalist.org/taxa/${taxon.id}`
          };
          imageCache[species] = photoData;
          saveImageCache();
          applyImage(img, photoData);
          return;
        }
      }
      showImageFailed(img);
    } catch {
      showImageFailed(img);
    }
  }

  function applyImage(img, photoData) {
    const wrap = img.parentElement;
    img.onload = () => { if (wrap) { wrap.classList.remove('img-loading'); } };
    img.onerror = () => showImageFailed(img);
    img.src = photoData.url;

    const hero = img.closest('.plant-detail-hero');
    const attrEl = hero?.querySelector('.attribution');
    if (attrEl) {
      attrEl.innerHTML = `<a href="${photoData.inatUrl}" target="_blank" rel="noopener">${photoData.attribution}</a>`;
    }
    const imgLink = img.closest('.wildlife-img-link');
    if (imgLink) imgLink.href = photoData.inatUrl;
    const entry = img.closest('.wildlife-entry');
    if (entry) {
      const nameLink = entry.querySelector('.wildlife-species-link');
      if (nameLink) nameLink.href = photoData.inatUrl;
    }
  }

  function showImageFailed(img) {
    const wrap = img.parentElement;
    if (wrap) {
      wrap.classList.remove('img-loading');
      wrap.classList.add('img-failed');
    }
    img.style.visibility = 'hidden';
  }

  function setupImageObserver() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('img[data-species]').forEach(img => queueImageFetch(img));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.species && !img.src) queueImageFetch(img);
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '300px' });
    document.querySelectorAll('img[data-species]').forEach(img => observer.observe(img));
  }

  const CUR_MONTH = new Date().getMonth();

  // ============================================================
  // INITIALIZATION & REGION MANAGER
  // ============================================================
  async function init() {
    try {
      const res = await fetch('data/places.json');
      state.places = await res.json();
    } catch {
      document.getElementById('plant-grid').innerHTML = '<p style="color:red">Failed to load region data.</p>';
      return;
    }

    populatePlaceSelector();

    const savedPlace = localStorage.getItem(PLACE_PREF_KEY);
    const startPlace = state.places.find(p => p.id === savedPlace) || state.places[0];

    await switchPlace(startPlace.id, true);
    bindEvents();
  }

  function populatePlaceSelector() {
    const sel = document.getElementById('place-selector');
    sel.innerHTML = state.places.map(p =>
      `<option value="${p.id}">${p.shortName}</option>`
    ).join('');
  }

  async function switchPlace(placeId, isInit) {
    const place = state.places.find(p => p.id === placeId);
    if (!place) return;

    state.activePlace = place;
    try { localStorage.setItem(PLACE_PREF_KEY, placeId); } catch {}

    const sel = document.getElementById('place-selector');
    if (sel.value !== placeId) sel.value = placeId;

    if (state.plantsByRegion[placeId]) {
      state.plants = state.plantsByRegion[placeId];
    } else {
      try {
        const resp = await fetch(`data/${place.plantDataFile}`);
        state.plants = await resp.json();
        state.plantsByRegion[placeId] = state.plants;
      } catch {
        state.plants = [];
        document.getElementById('plant-grid').innerHTML = '<p style="color:red">Failed to load plant data for this region.</p>';
        return;
      }
    }

    renderHero(place);
    renderInventory();
    renderCalendar();
    renderPhenologyChart();
    renderTrendChart();
    renderAbout(place);
    updateTrendsDesc(place);
    updateInventoryDesc(place);
    updateCacheStatusUI(getCacheTimestamp());
  }

  function renderHero(place) {
    document.getElementById('hero-title').textContent = 'Native Habitat Garden';
    document.getElementById('hero-subtitle').textContent = `${place.name} · ${place.ecosystem}`;
    document.getElementById('hero-desc').textContent = place.heroDescription;
  }

  function renderAbout(place) {
    const grid = document.getElementById('about-grid');
    const s = place.aboutSections;
    grid.innerHTML = `
      <div class="about-card">
        <h3>Why Native Plants?</h3>
        <p>${s.whyNative}</p>
      </div>
      <div class="about-card">
        <h3>${place.ecosystem}</h3>
        <p>${s.ecosystem}</p>
      </div>
      <div class="about-card">
        <h3>Start Your Own</h3>
        <p>${s.getStarted}</p>
      </div>`;
  }

  function updateTrendsDesc(place) {
    const el = document.getElementById('trends-desc');
    if (el) el.textContent = `Monthly observation patterns and year-over-year iNaturalist citizen-science trends in ${place.shortName}.`;
  }

  function updateInventoryDesc(place) {
    const el = document.getElementById('inventory-desc');
    if (el) el.textContent = `${state.plants.length} California native plants selected for wildlife value, drought tolerance, and beauty in ${place.shortName}. Click any plant to explore its care requirements, bloom schedule, and wildlife visitors.`;
  }

  // ---- Events ----
  function bindEvents() {
    document.getElementById('plant-search').addEventListener('input', renderInventory);
    document.getElementById('category-filter').addEventListener('change', renderInventory);
    document.getElementById('keystone-filter').addEventListener('change', renderInventory);

    document.getElementById('place-selector').addEventListener('change', (e) => {
      switchPlace(e.target.value);
    });

    document.querySelectorAll('.month-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentMonth = (state.currentMonth + parseInt(btn.dataset.dir) + 12) % 12;
        renderCalendar();
      });
    });

    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    const backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      const toggleBtt = () => backToTop.classList.toggle('visible', window.scrollY > 600);
      window.addEventListener('scroll', toggleBtt, { passive: true });
      toggleBtt();
      backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    updateCacheStatusUI(getCacheTimestamp());
    const refreshBtn = document.getElementById('refresh-cache-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        clearAllCaches();
        window.location.reload();
      });
    }
  }

  // ---- Filtering ----
  function getFilteredPlants() {
    const search = document.getElementById('plant-search').value.toLowerCase();
    const category = document.getElementById('category-filter').value;
    const keystoneOnly = document.getElementById('keystone-filter').checked;

    return state.plants.filter(p => {
      if (category !== 'all' && p.category !== category) return false;
      if (keystoneOnly && !p.isKeystone) return false;
      if (search) {
        const hay = [p.scientificName, ...p.commonNames, ...(p.synonyms || [])].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  // ============================================================
  // INVENTORY
  // ============================================================
  function renderInventory() {
    const grid = document.getElementById('plant-grid');
    const filtered = getFilteredPlants();
    const grouped = {};
    CATEGORY_ORDER.forEach(c => { grouped[c] = []; });
    filtered.forEach(p => {
      if (grouped[p.category]) grouped[p.category].push(p);
    });

    Object.values(grouped).forEach(arr => arr.sort((a, b) => {
      if (a.isKeystone !== b.isKeystone) return a.isKeystone ? -1 : 1;
      const wDiff = (b.wildlifeSpeciesSupported || 0) - (a.wildlifeSpeciesSupported || 0);
      if (wDiff !== 0) return wDiff;
      return (a.commonNames[0] || '').localeCompare(b.commonNames[0] || '');
    }));

    let html = '';
    for (const cat of CATEGORY_ORDER) {
      const list = grouped[cat];
      if (!list.length) continue;
      html += `<div class="category-group">
        <h3 class="category-heading">${CATEGORY_LABELS[cat]}</h3>
        <div class="category-plants">${list.map(plantCard).join('')}</div>
      </div>`;
    }
    if (!html) html = '<p class="cal-empty">No plants match your filters.</p>';
    grid.innerHTML = html;

    grid.querySelectorAll('.plant-card-header').forEach(header => {
      header.addEventListener('click', () => toggleCard(header.closest('.plant-card')));
      header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(header.closest('.plant-card')); } });
    });

    setupImageObserver();
  }

  function plantCard(p) {
    const wildlifeBadge = p.wildlifeSpeciesSupported
      ? `<span class="badge badge-wildlife">${p.wildlifeSpeciesSupported} wildlife spp.</span>`
      : '';
    return `<article class="plant-card" data-id="${p.id}">
      <div class="plant-card-header" tabindex="0" role="button" aria-expanded="false" aria-label="Expand details for ${p.commonNames[0]}">
        <div class="plant-card-img-wrap img-loading"><img class="plant-card-img" data-species="${p.scientificName}" alt="${p.commonNames[0]}" width="90" height="90"></div>
        <div class="plant-card-info">
          <div class="plant-card-name">${p.commonNames[0]}</div>
          <div class="plant-card-scientific">${p.scientificName}</div>
          <div class="plant-card-meta">
            ${p.isKeystone ? '<span class="badge badge-keystone">★ Keystone</span>' : ''}
            ${wildlifeBadge}
            <span class="badge badge-category">${CATEGORY_LABELS[p.category]}</span>
            <span class="badge badge-frequency" data-taxon="${p.iNaturalistData.taxonId}">…</span>
          </div>
        </div>
        <span class="expand-indicator" aria-hidden="true">▼</span>
      </div>
      <div class="plant-detail">${plantDetail(p)}</div>
    </article>`;
  }

  function toggleCard(card) {
    const wasExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded');
    const header = card.querySelector('.plant-card-header');
    header.setAttribute('aria-expanded', !wasExpanded);

    if (!wasExpanded) {
      card.querySelectorAll('.plant-detail img[data-species]').forEach(img => {
        if (!img.src) queueImageFetch(img);
      });
      card.querySelectorAll('.detail-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          switchTab(card, tab.dataset.tab);
          if (tab.dataset.tab === 'observations') loadObservationsTab(card);
        });
      });
      loadObservationsTab(card);
    }
  }

  async function loadObservationsTab(card) {
    const panel = card.querySelector('.tab-panel[data-tab="observations"]');
    if (!panel || panel.dataset.loaded) return;
    const taxonId = panel.dataset.taxon;
    const searchUrl = panel.dataset.searchUrl;
    if (!taxonId) return;
    panel.dataset.loaded = 'true';
    const obs = await fetchPlantObs(parseInt(taxonId, 10));
    panel.innerHTML = renderObservationsContent(obs, searchUrl);

    const badge = card.querySelector(`.badge-frequency[data-taxon="${taxonId}"]`);
    if (badge) badge.textContent = obs.frequency;
  }

  function switchTab(card, tabName) {
    card.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    card.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tabName));
  }

  function plantDetail(p) {
    return `
      <div class="plant-detail-top">
        <div class="plant-detail-hero">
          <div class="plant-detail-img-wrap img-loading"><img data-species="${p.scientificName}" alt="${p.commonNames[0]}"></div>
          <div class="attribution"></div>
        </div>
        <div class="plant-detail-body">
          <p class="plant-detail-desc">${p.description}</p>
          ${p.synonyms && p.synonyms.length ? `<p style="font-size:.85rem;color:#5a5a5a;margin-bottom:8px"><em>Formerly: ${p.synonyms.join(', ')}</em></p>` : ''}
          <div class="plant-detail-links">
            <a href="${p.calscapeUrl}" target="_blank" rel="noopener">Calscape ↗</a>
            <a href="${p.iNaturalistData.searchUrl}" target="_blank" rel="noopener">iNaturalist ↗</a>
          </div>
          <div class="planting-reqs">
            <div class="planting-req"><strong>Sun</strong>${p.plantingRequirements.sunExposure}</div>
            <div class="planting-req"><strong>Slope / Drainage</strong>${p.plantingRequirements.slopeRequirements}</div>
            <div class="planting-req"><strong>Soil</strong>${p.plantingRequirements.soilRequirements}</div>
          </div>
        </div>
      </div>
      <div class="detail-tabs" role="tablist">
        <button class="detail-tab" data-tab="maintenance" role="tab">Maintenance</button>
        <button class="detail-tab" data-tab="phenology" role="tab">Bloom &amp; Seeds</button>
        <button class="detail-tab active" data-tab="wildlife" role="tab">Wildlife</button>
        <button class="detail-tab" data-tab="observations" role="tab">Observations</button>
      </div>
      <div class="tab-panel" data-tab="maintenance">${maintenanceTab(p)}</div>
      <div class="tab-panel" data-tab="phenology">${phenologyTab(p)}</div>
      <div class="tab-panel active" data-tab="wildlife">${wildlifeTab(p)}</div>
      <div class="tab-panel" data-tab="observations" data-taxon="${p.iNaturalistData.taxonId}" data-search-url="${p.iNaturalistData.searchUrl}">
        <p class="cal-detail" style="text-align:center;padding:24px 0">Loading observation data…</p>
      </div>`;
  }

  function maintenanceTab(p) {
    const ws = p.maintenance.wateringSchedule;
    const pruneSet = new Set(p.maintenance.pruningMonths || []);
    const waterCells = MONTH_KEYS.map((k, i) => {
      const freq = ws[k] || 0;
      const cls = freq > 0 ? (freq >= 2 ? 'water-moderate' : 'water-low') : 'water-none';
      const cur = i === CUR_MONTH ? ' water-current' : '';
      return `<div class="water-cell ${cls}${cur}"><span class="month-label">${MONTHS[i]}</span>${WATER_LABELS[freq] || '—'}</div>`;
    }).join('');

    const pruneCells = Array.from({ length: 12 }, (_, i) => {
      const active = pruneSet.has(i + 1);
      const cls = active ? 'prune-active' : 'prune-inactive';
      const cur = i === CUR_MONTH ? ' prune-current' : '';
      return `<div class="prune-cell ${cls}${cur}"><span class="month-label">${MONTHS[i]}</span>${active ? '✂' : '—'}</div>`;
    }).join('');

    return `
      <h5 style="font-size:.85rem;margin-bottom:8px;color:#6b4c3b">💧 Watering</h5>
      <div class="watering-grid">${waterCells}</div>
      <p class="maintenance-note">${p.maintenance.wateringNotes}</p>
      <h5 style="font-size:.85rem;margin-bottom:8px;color:#6b4c3b">✂ Pruning${p.maintenance.pruningTask ? ` — ${p.maintenance.pruningTask}` : ''}</h5>
      <div class="watering-grid">${pruneCells}</div>
      <p class="maintenance-note">${p.maintenance.pruningNotes}</p>
      ${p.maintenance.specialNotes ? `<p class="maintenance-note"><strong>Notes:</strong> ${p.maintenance.specialNotes}</p>` : ''}`;
  }

  function phenologyTab(p) {
    const ph = p.phenology;
    const cells = Array.from({ length: 12 }, (_, i) => {
      const d = phenoCellData(ph, i + 1);
      let cls = d.phase === 'empty' ? 'phenology-empty' : '';
      if (d.phase === 'seed') cls = 'pheno-seed-stripe';
      if (d.phase === 'berry') cls += ' pheno-berry-dot';
      if (!d.light) cls += ' pheno-text-light';
      if (i === CUR_MONTH) cls += ' pheno-current';
      const style = d.bg && d.phase !== 'seed' ? ` style="background:${d.bg}"` : '';
      return `<div class="pheno-month ${cls}"${style}><span class="pheno-label">${MONTHS[i]}</span></div>`;
    }).join('');

    let colorInfo = '';
    if (ph.bloom && ph.bloom.colors) {
      colorInfo += `<div class="bloom-colors">${ph.bloom.colors.map(c =>
        `<span class="color-swatch"><span class="color-dot" style="background:${COLOR_MAP[c] || c}"></span>${c}</span>`
      ).join('')}</div>`;
    }

    return `
      <div class="phenology-legend">
        <span class="phenology-legend-item"><span class="legend-swatch" style="background:${COLOR_MAP[ph.bloom?.colors?.[0]] || '#ccc'}"></span>Bloom</span>
        ${ph.berry ? `<span class="phenology-legend-item"><span class="legend-swatch pheno-berry-dot" style="background:${COLOR_MAP[ph.berry.colors?.[0]] || COLOR_MAP['red']}"></span>Berry / Fruit</span>` : ''}
        ${ph.seed ? `<span class="phenology-legend-item"><span class="legend-swatch pheno-seed-stripe"></span>Seed</span>` : ''}
      </div>
      <div class="phenology-row">${cells}</div>
      ${colorInfo}
      ${ph.berry ? `<p style="font-size:.85rem;margin-top:4px"><strong>Berry/Fruit:</strong> ${ph.berry.description || ''}</p>` : ''}
      ${ph.seed ? `<p style="font-size:.85rem;margin-top:4px"><strong>Seed:</strong> ${ph.seed.description || ''}</p>` : ''}
      <div class="phenology-eco">${ph.ecologicalValue}</div>`;
  }

  function wildlifeTab(p) {
    if (!p.wildlife || !p.wildlife.length) return '<p class="cal-empty">No wildlife data.</p>';

    return p.wildlife.map(w => {
      const monthSet = new Set(w.months);
      const cells = Array.from({ length: 12 }, (_, i) => {
        let cls = monthSet.has(i + 1) ? 'wl-month-active' : 'wl-month-inactive';
        if (i === CUR_MONTH) cls += ' wl-month-current';
        return `<div class="wl-month ${cls}"><span class="wl-month-label">${MONTHS[i]}</span></div>`;
      }).join('');

      const imgHtml = `<a class="wildlife-img-link" target="_blank" rel="noopener"><div class="wildlife-img-wrap img-loading img-circle"><img class="wildlife-img" data-species="${escapeAttr(w.species)}" alt="${escapeAttr(w.species)}" width="60" height="60"></div></a>`;

      return `<div class="wildlife-entry">
        ${imgHtml}
        <div class="wildlife-info">
          <a class="wildlife-species wildlife-species-link" target="_blank" rel="noopener">${w.species}</a>
          <div class="wildlife-activity">${ACTIVITY_LABELS[w.activity] || w.activity}</div>
          <div class="wildlife-months">${cells}</div>
          ${w.notes ? `<div class="wildlife-notes">${w.notes}</div>` : ''}
          <div class="attribution" style="font-size:.68rem;margin-top:2px"></div>
        </div>
      </div>`;
    }).join('');
  }

  function renderObservationsContent(obs, searchUrl) {
    const placeName = state.activePlace?.shortName || '';
    const byMonth = obs.observationsByMonth;
    const byYear = obs.observationsByYear;
    const maxMonth = Math.max(...Object.values(byMonth), 1);
    const maxYear = Math.max(...Object.values(byYear), 1);

    const histogram = MONTH_KEYS.map((k, i) => {
      const v = byMonth[k] || 0;
      const pct = (v / maxMonth * 100).toFixed(0);
      return `<div class="obs-bar-wrap">
        <span class="obs-bar-value">${v}</span>
        <div class="obs-bar" style="height:${pct}%"></div>
        <span class="obs-bar-label">${MONTHS[i]}</span>
      </div>`;
    }).join('');

    const years = Object.keys(byYear).sort();
    const trend = years.map(y => {
      const v = byYear[y];
      const pct = (v / maxYear * 100).toFixed(0);
      return `<div class="obs-trend-bar-wrap">
        <span class="obs-trend-value">${v}</span>
        <div class="obs-trend-bar" style="height:${pct}%"></div>
        <span class="obs-trend-label">${y}</span>
      </div>`;
    }).join('');

    const trendDir = years.length >= 2
      ? (byYear[years[years.length - 1]] > byYear[years[0]] ? '↑ Increasing' : byYear[years[years.length - 1]] < byYear[years[0]] ? '↓ Decreasing' : '→ Stable')
      : '';

    return `
      <p class="obs-total"><strong>${obs.totalObservations}</strong> total observations (${LOOKBACK_YEARS}-year) · <strong>${obs.frequency}</strong> in ${placeName} ${trendDir ? `· <strong>${trendDir}</strong>` : ''}</p>
      <h5 style="font-size:.85rem;margin-bottom:8px;color:#6b4c3b">Monthly Observations</h5>
      <div class="obs-histogram">${histogram}</div>
      <h5 style="font-size:.85rem;margin:16px 0 8px;color:#6b4c3b">Year-over-Year Trend</h5>
      <div class="obs-trend">${trend}</div>
      <p style="font-size:.75rem;color:#5a5a5a;margin-top:8px">Data from <a href="${searchUrl}" target="_blank" rel="noopener">iNaturalist</a></p>`;
  }

  // ============================================================
  // GARDEN CALENDAR
  // ============================================================
  function renderCalendar() {
    const m = state.currentMonth + 1;
    const mk = MONTH_KEYS[state.currentMonth];
    document.getElementById('calendar-month-label').textContent = MONTHS[state.currentMonth] + ' — What\'s Happening';

    renderWildlifeCalendar(m);

    const waterJobs = [];
    const pruneJobs = [];
    state.plants.forEach(p => {
      const freq = p.maintenance.wateringSchedule[mk] || 0;
      if (freq > 0) {
        const label = freq === 1 ? '1×/month' : `${freq}×/month`;
        waterJobs.push({ name: p.commonNames[0], detail: label });
      }
      if ((p.maintenance.pruningMonths || []).includes(m)) {
        pruneJobs.push({ name: p.commonNames[0], detail: p.maintenance.pruningTask || 'Prune' });
      }
    });

    function renderMaintCard(j) {
      return `<div class="cal-maint-card">
        <span class="cal-maint-plant">${j.name}</span>
        <span class="cal-maint-detail">${j.detail}</span>
      </div>`;
    }

    function renderMaintColumn(icon, label, items) {
      const content = items.length ? items.map(renderMaintCard).join('') : '<p class="cal-empty">None this month</p>';
      return `<div class="cal-maint-column">
        <h4 class="cal-maint-column-label">${icon} ${label}</h4>
        ${content}
      </div>`;
    }

    const maintGrid = document.getElementById('cal-maintenance-grid');
    maintGrid.innerHTML = renderMaintColumn('💧', 'Watering', waterJobs) + renderMaintColumn('✂️', 'Pruning', pruneJobs);
  }

  async function renderWildlifeCalendar(mo) {
    const grid = document.getElementById('cal-wildlife-grid');

    const raw = [];
    state.plants.forEach(p => {
      (p.wildlife || []).forEach(w => {
        if (w.months.includes(mo)) {
          raw.push({ plant: p.commonNames[0], species: w.species, activity: ACTIVITY_LABELS[w.activity] || w.activity });
        }
      });
    });

    if (!raw.length) {
      grid.innerHTML = '<p class="cal-empty">No wildlife activity this month</p>';
      return;
    }

    grid.innerHTML = '<p class="cal-detail" style="text-align:center;padding:24px 0">Loading wildlife observations…</p>';

    const speciesMap = new Map();
    raw.forEach(r => {
      if (!speciesMap.has(r.species)) speciesMap.set(r.species, { species: r.species, obs: 0, activityMap: new Map() });
      const entry = speciesMap.get(r.species);
      if (!entry.activityMap.has(r.activity)) entry.activityMap.set(r.activity, []);
      const plantList = entry.activityMap.get(r.activity);
      if (!plantList.includes(r.plant)) plantList.push(r.plant);
    });

    await Promise.all([...speciesMap.keys()].map(async sp => {
      const monthly = await fetchWildlifeObs(sp);
      speciesMap.get(sp).obs = monthly[mo] || 0;
    }));

    const entries = [...speciesMap.values()].map(e => ({
      species: e.species,
      obs: e.obs,
      interactions: [...e.activityMap.entries()].map(([activity, plants]) => ({ activity, plants }))
    }));
    entries.sort((a, b) => b.obs - a.obs);

    const counts = entries.map(e => e.obs).sort((a, b) => b - a);
    const p66 = counts[Math.floor(counts.length * 0.33)] || 0;
    const p33 = counts[Math.floor(counts.length * 0.66)] || 0;

    const buckets = { common: [], uncommon: [], rare: [] };
    entries.forEach(w => {
      if (w.obs >= p66 && p66 > 0) buckets.common.push(w);
      else if (w.obs >= p33 && p33 > 0) buckets.uncommon.push(w);
      else buckets.rare.push(w);
    });

    function renderWildlifeCard(w) {
      const details = w.interactions.map(i =>
        `<span class="cal-wl-interaction">${i.activity} on ${i.plants.join(', ')}</span>`
      ).join('');
      return `<div class="cal-wl-card wildlife-entry">
        <a class="wildlife-img-link cal-wl-img-link" target="_blank" rel="noopener"><div class="cal-wl-img-wrap img-loading img-circle img-sm"><img class="cal-wl-img" data-species="${escapeAttr(w.species)}" alt="${escapeAttr(w.species)}" width="48" height="48"></div></a>
        <div class="cal-wl-info">
          <a class="wildlife-species-link cal-wl-name" target="_blank" rel="noopener">${w.species}</a>
          <span class="cal-wl-detail">${w.obs} obs/mo</span>
          <div class="cal-wl-interactions">${details}</div>
        </div>
      </div>`;
    }

    function renderColumn(label, threshold, items) {
      const content = items.length ? items.map(renderWildlifeCard).join('') : '<p class="cal-empty">None this month</p>';
      return `<div class="cal-wl-column">
        <h4 class="cal-wl-column-label">${label} <span class="cal-wl-threshold">${threshold}</span></h4>
        ${content}
      </div>`;
    }

    const uncommonLabel = (p33 > 0 && p33 < p66) ? `${p33}–${p66 - 1} obs` : `< ${p66} obs`;
    const rareLabel = (p33 > 0 && p33 < p66) ? `< ${p33} obs` : `< ${p66} obs`;
    grid.innerHTML = renderColumn('Common', `≥ ${p66} obs`, buckets.common)
      + renderColumn('Uncommon', uncommonLabel, buckets.uncommon)
      + renderColumn('Rare', rareLabel, buckets.rare);

    setupImageObserver();
  }

  // ============================================================
  // PHENOLOGY CHART (garden-wide)
  // ============================================================
  function renderPhenologyChart() {
    const container = document.getElementById('phenology-chart');
    const sorted = [...state.plants].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      return ai !== bi ? ai - bi : (a.commonNames[0] || '').localeCompare(b.commonNames[0] || '');
    });

    if (!sorted.length) { container.innerHTML = ''; return; }

    let rows = sorted.map(p => {
      const ph = p.phenology;
      const cells = Array.from({ length: 12 }, (_, i) => {
        const d = phenoCellData(ph, i + 1);
        let cls = d.phase === 'empty' ? 'phenology-empty' : '';
        if (d.phase === 'seed') cls = 'pheno-seed-stripe';
        if (d.phase === 'berry') cls += ' pheno-berry-dot';
        const style = d.bg && d.phase !== 'seed' ? ` style="background:${d.bg}"` : '';
        const cur = i === CUR_MONTH ? ' current-month' : '';
        return `<td class="${cur}"><div class="pheno-cell ${cls}"${style}></div></td>`;
      }).join('');
      return `<tr><td>${p.commonNames[0]}</td>${cells}</tr>`;
    }).join('');

    const sampleColors = ['yellow', 'red', 'purple', 'white'].filter(c => COLOR_MAP[c]);
    const bloomSwatches = sampleColors.map(c =>
      `<span class="legend-swatch" style="background:${COLOR_MAP[c]}"></span>`
    ).join('');

    container.innerHTML = `
      <div class="phenology-legend" style="margin-bottom:12px">
        <span class="phenology-legend-item">${bloomSwatches} Bloom</span>
        <span class="phenology-legend-item"><span class="legend-swatch pheno-berry-dot" style="background:${COLOR_MAP['red']}"></span> Berry / Fruit</span>
        <span class="phenology-legend-item"><span class="legend-swatch pheno-seed-stripe"></span> Seed</span>
      </div>
      <div class="pheno-scroll">
        <table>
          <thead><tr><th>Plant</th>${MONTHS.map((m, i) => `<th class="${i === CUR_MONTH ? 'current-month' : ''}">${m}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ============================================================
  // TREND CHART (garden-wide) — SVG sparklines
  // ============================================================
  async function renderTrendChart() {
    const container = document.getElementById('trend-chart');
    if (!state.plants.length) { container.innerHTML = ''; return; }
    container.innerHTML = '<p class="cal-detail" style="text-align:center;padding:24px 0">Loading observation trends…</p>';

    const sorted = [...state.plants].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      return ai !== bi ? ai - bi : (a.commonNames[0] || '').localeCompare(b.commonNames[0] || '');
    });

    const obsResults = await Promise.all(sorted.map(p => fetchPlantObs(p.iNaturalistData.taxonId)));
    const years = [...new Set(obsResults.flatMap(o => Object.keys(o.observationsByYear)))].sort();
    if (!years.length) { container.innerHTML = ''; return; }

    sorted.forEach((p, i) => {
      const badge = document.querySelector(`.badge-frequency[data-taxon="${p.iNaturalistData.taxonId}"]`);
      if (badge) badge.textContent = obsResults[i].frequency;
    });

    const cards = sorted.map((p, idx) => {
      const obs = obsResults[idx];
      const byMonth = obs.observationsByMonth;
      const byYear = obs.observationsByYear;

      const monthVals = MONTH_KEYS.map(k => byMonth[k] || 0);
      const maxM = Math.max(...monthVals, 1);
      const mw = 140, mh = 32, mpad = 1;
      const barW = (mw - mpad * 2) / 12 - 1;
      const monthBars = monthVals.map((v, i) => {
        const x = mpad + i * ((mw - mpad * 2) / 12);
        const barH = (v / maxM) * (mh - 10);
        const fill = i === CUR_MONTH ? 'var(--c-sage)' : 'var(--c-sage-light)';
        return `<rect x="${x.toFixed(1)}" y="${(mh - 10 - barH).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 0.5).toFixed(1)}" rx="1" fill="${fill}"/>
          <text x="${(x + barW / 2).toFixed(1)}" y="${mh}" text-anchor="middle" font-size="6" fill="var(--c-text-light)">${MONTHS[i][0]}</text>`;
      }).join('');

      const yearVals = years.map(y => byYear[y] || 0);
      const maxY = Math.max(...yearVals, 1);
      const minY = Math.min(...yearVals);
      const first = yearVals[0];
      const last = yearVals[yearVals.length - 1];
      const trendDir = last > first ? 'up' : last < first ? 'down' : 'flat';
      const trendLabel = trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→';
      const trendClass = trendDir === 'up' ? 'trend-up' : trendDir === 'down' ? 'trend-down' : 'trend-flat';

      const yw = 140, yh = 36, ypad = 2;
      const stepX = (yw - ypad * 2) / Math.max(yearVals.length - 1, 1);
      const points = yearVals.map((v, i) => {
        const x = ypad + i * stepX;
        const y = ypad + (yh - ypad * 2 - 12) - ((v - minY) / (maxY - minY || 1)) * (yh - ypad * 2 - 12);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const polyline = points.join(' ');
      const areaPoints = `${ypad},${yh - 12 - ypad} ${polyline} ${(ypad + (yearVals.length - 1) * stepX).toFixed(1)},${yh - 12 - ypad}`;

      const dots = yearVals.map((v, i) => {
        const x = ypad + i * stepX;
        const y = ypad + (yh - ypad * 2 - 12) - ((v - minY) / (maxY - minY || 1)) * (yh - ypad * 2 - 12);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="var(--c-sky)" stroke="var(--c-white)" stroke-width="1"/>`;
      }).join('');

      const yearLabels = years.map((y, i) => {
        const x = ypad + i * stepX;
        return `<text x="${x.toFixed(1)}" y="${yh - 1}" text-anchor="middle" font-size="7" fill="var(--c-text-light)">${y.slice(2)}</text>`;
      }).join('');

      const valueLabels = yearVals.map((v, i) => {
        const x = ypad + i * stepX;
        const y = ypad + (yh - ypad * 2 - 12) - ((v - minY) / (maxY - minY || 1)) * (yh - ypad * 2 - 12);
        return `<text x="${x.toFixed(1)}" y="${Math.max(y - 4, 7).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="600" fill="var(--c-text)">${v}</text>`;
      }).join('');

      return `<div class="trend-card">
        <div class="trend-card-header">
          <span class="trend-card-name">${p.commonNames[0]}</span>
          <span class="trend-badge ${trendClass}">${trendLabel} ${obs.totalObservations}</span>
        </div>
        <div class="trend-card-label">Monthly</div>
        <svg class="trend-month-svg" viewBox="0 0 ${mw} ${mh}" preserveAspectRatio="xMidYMid meet" aria-label="Monthly observations for ${p.commonNames[0]}">
          ${monthBars}
        </svg>
        <div class="trend-card-label">Year-over-Year</div>
        <svg class="trend-sparkline" viewBox="0 0 ${yw} ${yh}" preserveAspectRatio="xMidYMid meet" aria-label="Yearly trend for ${p.commonNames[0]}">
          <polygon points="${areaPoints}" fill="var(--c-sky)" opacity="0.15"/>
          <polyline points="${polyline}" fill="none" stroke="var(--c-sky)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          ${dots}
          ${valueLabels}
          ${yearLabels}
        </svg>
      </div>`;
    }).join('');

    container.innerHTML = `<div class="trend-grid">${cards}</div>`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
