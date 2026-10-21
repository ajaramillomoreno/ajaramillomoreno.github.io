// LightningRiskMX — three independent GeoJSON data sources; fully offline-capable.
// Scientific values come from the datasets; only visual color breaks are chosen here.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const displayMessage = (title, detail) => {
    const node = $('mapMessage');
    node.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = title;
    const explanation = document.createElement('div');
    explanation.textContent = detail;
    node.append(strong, explanation);
    node.hidden = false;
  };
  const hideMessage = () => { $('mapMessage').hidden = true; };

  if (!window.L) {
    displayMessage('Leaflet is missing', 'Restore the complete vendor/leaflet/ directory.');
    return;
  }

  const RISK_LABELS = ['Very low', 'Low', 'Moderate', 'High', 'Very high'];
  const MODE = {
    municipal_incidents: {
      title: 'Municipal lightning incidents',
      subtitle: 'Accumulated fatality incidents · 1998–2021',
      filename: 'municipal_lightning_incidents.js',
      variable: 'LIGHTNING_MX_DATA',
      geography: 'municipality',
      required: ['NOM_ENT', 'NOM_MUN', 'ENTIDAD', 'MUN', 'Muertes_e'],
      palette: ['#f3f5f8', '#f7dfb4', '#f6ad61', '#db6b3c', '#a9262c'],
      breaks: ['0', '1', '2–4', '5–9', '10 or more'],
      legendNote: 'Accumulated fatality incidents, not individual deaths. Color breaks are for web visualization.'
    },
    state_incidents: {
      title: 'State lightning incidents',
      subtitle: 'Sum of municipal fatality incidents · 1998–2021',
      filename: 'state_lightning_incidents.js',
      variable: 'LIGHTNING_MX_STATE_DATA',
      geography: 'state',
      required: ['ENTIDAD', 'NOM_ENT', 'Muertes_e'],
      palette: ['#f3f5f8', '#fff0cb', '#fbd78b', '#f4a65b', '#d66b3e', '#9e2731'],
      breaks: ['0', '1–9', '10–24', '25–49', '50–99', '100 or more'],
      legendNote: 'State totals are read from the prepared state dataset. Color breaks are for web visualization.'
    },
    municipal_risk: {
      title: 'Municipal lightning risk',
      subtitle: 'Risk category from GN_Risk (0–4)',
      filename: 'municipal_lightning_risk.js',
      variable: 'LIGHTNING_MX_RISK_DATA',
      geography: 'municipality',
      required: ['ENTIDAD', 'MUN', 'NOM_ENT', 'NOM_MUN', 'GN_Risk'],
      palette: ['#fff8e7', '#f7e4a1', '#f4c064', '#ed8d3f', '#bd2828'],
      breaks: RISK_LABELS,
      legendNote: 'The original GN_Risk category is used directly. The map does not recompute risk.'
    }
  };

  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const stateSelect = $('stateSelect');
  const buttons = Array.from(document.querySelectorAll('.layer-choice'));
  const map = L.map('map', { preferCanvas: true, zoomControl: false, minZoom: 4, maxZoom: 12 });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // Draw state borders ABOVE municipal polygons in a separate noninteractive pane.
  // The state dataset itself remains interactive only in the State incidents view.
  const stateBordersPane = map.createPane('stateBorders');
  stateBordersPane.style.zIndex = '450';
  stateBordersPane.style.pointerEvents = 'none';
  const fallbackBounds = L.latLngBounds([[14.3, -118.5], [33.1, -86.4]]);
  map.fitBounds(fallbackBounds, { padding: [20, 20] });

  let activeMode = 'municipal_incidents';
  let activeLayer = null;
  let stateBorderLayer = null;
  let visibleFeatures = [];
  let nationalBounds = null;
  const rawData = () => window[MODE[activeMode].variable];
  const validGeoJSON = (d) => d && d.type === 'FeatureCollection' && Array.isArray(d.features);
  const escapeHtml = (v) => String(v ?? '—').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => Number.isFinite(Number(v)) && v !== null && v !== '' ? fmt.format(Number(v)) : '—';
  const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function category(p) {
    if (activeMode === 'municipal_risk') {
      const c = Number(p.GN_Risk);
      return Number.isInteger(c) && c >= 0 && c <= 4 ? c : -1;
    }
    if (p.Muertes_e === null || p.Muertes_e === undefined) return -1;
    const v = Number(p.Muertes_e);
    if (!Number.isFinite(v) || v < 0) return -1;
    if (activeMode === 'municipal_incidents') {
      return v === 0 ? 0 : v === 1 ? 1 : v <= 4 ? 2 : v <= 9 ? 3 : 4;
    }
    return v === 0 ? 0 : v <= 9 ? 1 : v <= 24 ? 2 : v <= 49 ? 3 : v <= 99 ? 4 : 5;
  }

  function regionStyle(feature) {
    const cfg = MODE[activeMode];
    const cat = category(feature.properties);
    return {
      fillColor: cfg.palette[cat] || '#cbd5e1',
      color: cfg.geography === 'state' ? '#41556b' : '#516475',
      weight: cfg.geography === 'state' ? 1 : 0.38,
      opacity: 0.83,
      fillOpacity: 0.94
    };
  }

  function popupMarkup(p) {
    const cfg = MODE[activeMode];
    const row = (label, value) => `<div class="popup-line"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
    if (cfg.geography === 'state') {
      return `<div class="popup-title">${escapeHtml(p.NOM_ENT)}</div>` +
        `<div class="popup-subtitle">State of Mexico · 1998–2021</div>` +
        row('Fatality incidents', num(p.Muertes_e));
    }
    const header = `<div class="popup-title">${escapeHtml(p.NOM_MUN)}</div>` +
      `<div class="popup-subtitle">${escapeHtml(p.NOM_ENT)}</div>`;
    return activeMode === 'municipal_risk'
      ? header + row('Lightning risk', RISK_LABELS[category(p)] ?? 'Unknown')
      : header + row('Fatality incidents', num(p.Muertes_e));
  }

  function resetHover() {
    $('hoverHint').textContent = activeMode === 'state_incidents' ? 'State details' : 'Municipality details';
    $('hoverName').textContent = 'Explore the Map';
    $('hoverDetails').textContent = 'Hover over a region or click to view its data.';
  }

  function updateHover(p) {
    const isState = MODE[activeMode].geography === 'state';
    $('hoverHint').textContent = isState ? 'State' : `Municipality · ${p.NOM_ENT}`;
    $('hoverName').textContent = isState ? p.NOM_ENT : p.NOM_MUN;
    $('hoverDetails').textContent = activeMode === 'municipal_risk'
      ? `Lightning risk: ${RISK_LABELS[category(p)] ?? 'Unknown'}`
      : `Accumulated fatality incidents: ${num(p.Muertes_e)}`;
  }

  function attachRegion(feature, layer) {
    layer.bindPopup(popupMarkup(feature.properties), { maxWidth: 330 });
    layer.on('mouseover', function () {
      this.setStyle({ weight: MODE[activeMode].geography === 'state' ? 2.5 : 1.7, color: '#13263e', fillOpacity: 1 });
      if (this.bringToFront) this.bringToFront();
      updateHover(feature.properties);
    });
    layer.on('mouseout', function () {
      if (activeLayer && activeLayer.hasLayer(this)) activeLayer.resetStyle(this);
      resetHover();
    });
    layer.on('click', () => updateHover(feature.properties));
  }

  function getAnyStates() {
    const values = [];
    for (const key of Object.keys(MODE)) {
      const data = window[MODE[key].variable];
      if (validGeoJSON(data)) {
        for (const f of data.features) {
          const name = f.properties && f.properties.NOM_ENT;
          if (typeof name === 'string' && name.trim()) values.push(name);
        }
      }
    }
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es'));
  }

  function populateStates() {
    const oldSelection = stateSelect.value;
    stateSelect.replaceChildren(new Option('All of Mexico', ''));
    getAnyStates().forEach(s => stateSelect.add(new Option(s, s)));
    if ([...stateSelect.options].some(o => o.value === oldSelection)) stateSelect.value = oldSelection;
  }

  function updateLegend() {
    const cfg = MODE[activeMode];
    $('mapLegendTitle').textContent = cfg.title;
    $('mapLegendSubheading').textContent = cfg.subtitle;
    $('legendNote').textContent = cfg.legendNote + (stateBorderLayer ? ' Dark outlines show state borders (reference only).' : '');
    const legend = $('legend');
    legend.replaceChildren();
    cfg.breaks.forEach((name, i) => {
      const row = document.createElement('div'); row.className = 'legend-row';
      const desc = document.createElement('span'); desc.className = 'desc';
      const patch = document.createElement('span'); patch.className = 'legend-patch';
      patch.style.background = cfg.palette[i];
      const label = document.createElement('span'); label.textContent = name;
      desc.append(patch, label);
      const count = document.createElement('span'); count.className = 'number';
      count.textContent = `${fmt.format(visibleFeatures.filter(f => category(f.properties) === i).length)} ${cfg.geography === 'state' ? 'states' : 'mun.'}`;
      row.append(desc, count);
      legend.append(row);
    });
  }

  function clearSearch() {
    const box = $('searchResults');
    box.replaceChildren(); box.style.display = 'none';
    $('searchStatus').textContent = '';
  }

  function updateSearchUI() {
    const states = activeMode === 'state_incidents';
    $('searchLabel').textContent = states ? 'Find a State' : 'Find a Municipality';
    $('placeSearch').placeholder = states ? 'e.g., Oaxaca, Puebla…' : 'e.g., Toluca, Mérida…';
    $('placeSearch').setAttribute('aria-label', states ? 'Find a state' : 'Find a municipality');
  }

  function updateButtons() {
    buttons.forEach(btn => {
      const active = btn.dataset.map === activeMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function updateStateBorders(selectedState) {
    // The state outline file is already included for the interactive state map.
    // Reuse its GEOMETRIES for municipal maps only; no popup, hover or click.
    if (activeMode === 'state_incidents' || !activeLayer) return;
    const stateData = window.LIGHTNING_MX_STATE_DATA;
    if (!validGeoJSON(stateData)) return;

    const stateFeatures = selectedState
      ? stateData.features.filter(f => f.properties && f.properties.NOM_ENT === selectedState)
      : stateData.features;
    if (!stateFeatures.length) return;

    stateBorderLayer = L.geoJSON(
      { type: 'FeatureCollection', features: stateFeatures },
      {
        pane: 'stateBorders',
        interactive: false,
        bubblingMouseEvents: false,
        style: {
          color: '#263447',
          weight: 1.4,
          opacity: 0.95,
          fill: false,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }
    ).addTo(map);
  }

  function refreshMap(fit = false) {
    clearSearch();
    map.closePopup();
    if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null; }
    if (stateBorderLayer) { map.removeLayer(stateBorderLayer); stateBorderLayer = null; }
    const cfg = MODE[activeMode];
    const d = rawData();
    const selectedState = stateSelect.value;
    visibleFeatures = [];
    if (!validGeoJSON(d)) {
      displayMessage('Map data not found', `Copy data/${cfg.filename} into the data/ directory. Its JavaScript must define window.${cfg.variable}.`);
    } else if (d.features.length === 0) {
      displayMessage('Empty map dataset', `The file ${cfg.filename} contains no features.`);
    } else {
      const absent = cfg.required.filter(field => !(field in (d.features[0].properties || {})));
      if (absent.length) {
        displayMessage('Dataset attributes do not match', `${cfg.filename} is missing: ${absent.join(', ')}.`);
      } else {
        hideMessage();
        visibleFeatures = selectedState ? d.features.filter(f => f.properties && f.properties.NOM_ENT === selectedState) : d.features;
        activeLayer = L.geoJSON({ type: 'FeatureCollection', features: visibleFeatures },
          { style: regionStyle, onEachFeature: attachRegion }).addTo(map);
        updateStateBorders(selectedState);
        if (fit && activeLayer.getBounds().isValid()) {
          map.fitBounds(activeLayer.getBounds(), { padding: [30, 30], maxZoom: selectedState ? 9 : 6 });
        }
        // Use the full national extent to reset the view regardless of a state filter.
        if (!selectedState && activeLayer.getBounds().isValid()) nationalBounds = activeLayer.getBounds();
      }
    }
    $('mapBottom').textContent = `${cfg.geography === 'state' ? 'State' : 'Municipal'} vector data · ${stateBorderLayer ? 'state outlines are noninteractive · ' : ''}no external basemap`;
    updateSearchUI(); updateButtons(); updateLegend(); resetHover();
  }

  function focusFeature(feature) {
    const props = feature.properties;
    if (stateSelect.value && props.NOM_ENT !== stateSelect.value) {
      stateSelect.value = props.NOM_ENT;
      refreshMap(false);
    }
    if (!activeLayer) return;
    activeLayer.eachLayer(layer => {
      const lp = layer.feature.properties;
      const same = activeMode === 'state_incidents'
        ? lp.ENTIDAD == props.ENTIDAD && lp.NOM_ENT === props.NOM_ENT
        : lp.ENTIDAD == props.ENTIDAD && lp.MUN == props.MUN;
      if (same) {
        map.fitBounds(layer.getBounds(), { padding: [70, 70], maxZoom: activeMode === 'state_incidents' ? 8 : 10 });
        layer.openPopup(); if (layer.bringToFront) layer.bringToFront();
        updateHover(lp);
      }
    });
    $('placeSearch').value = activeMode === 'state_incidents' ? props.NOM_ENT : props.NOM_MUN;
    clearSearch();
  }

  $('searchForm').addEventListener('submit', event => {
    event.preventDefault(); clearSearch();
    const query = normalize($('placeSearch').value);
    if (!query) { $('searchStatus').textContent = 'Enter a place name.'; return; }
    const d = rawData();
    if (!validGeoJSON(d)) { $('searchStatus').textContent = 'Load the selected dataset first.'; return; }
    const key = activeMode === 'state_incidents' ? 'NOM_ENT' : 'NOM_MUN';
    const selectMatching = features => features.filter(f => f.properties && normalize(f.properties[key]).includes(query));
    let matches = selectMatching(visibleFeatures);
    if (!matches.length && stateSelect.value) matches = selectMatching(d.features);
    if (!matches.length) { $('searchStatus').textContent = 'No matching places were found.'; return; }
    matches.sort((a, b) => {
      const an = normalize(a.properties[key]), bn = normalize(b.properties[key]);
      return (an.startsWith(query) ? 0 : 1) - (bn.startsWith(query) ? 0 : 1) || an.localeCompare(bn, 'es');
    });
    if (matches.length === 1) { focusFeature(matches[0]); return; }
    const container = $('searchResults'); container.style.display = 'block';
    matches.slice(0, 12).forEach(f => {
      const b = document.createElement('button'); b.type = 'button';
      const name = document.createElement('strong'); name.textContent = f.properties[key];
      const sub = document.createElement('small'); sub.textContent = activeMode === 'state_incidents' ? 'State' : f.properties.NOM_ENT;
      b.append(name, sub); b.addEventListener('click', () => focusFeature(f)); container.append(b);
    });
    $('searchStatus').textContent = `${matches.length} matches. Select a place.` + (matches.length > 12 ? ' Showing the first 12.' : '');
  });

  buttons.forEach(button => button.addEventListener('click', () => {
    if (activeMode === button.dataset.map) return;
    activeMode = button.dataset.map;
    $('placeSearch').value = '';
    refreshMap(Boolean(stateSelect.value));
  }));

  stateSelect.addEventListener('change', () => {
    $('placeSearch').value = '';
    refreshMap(true);
  });

  $('resetButton').addEventListener('click', () => {
    stateSelect.value = '';
    $('placeSearch').value = '';
    activeMode = 'municipal_incidents';
    refreshMap(true);
    if (!activeLayer) map.fitBounds(fallbackBounds, { padding: [20, 20] });
  });

  populateStates();
  refreshMap(true);
})();
