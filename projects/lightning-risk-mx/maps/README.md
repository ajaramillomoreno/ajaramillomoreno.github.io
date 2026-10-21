# LightningRiskMX — Three interactive maps

Standalone, static, **offline-capable** web viewer based on the interactive page you provided. The sidebar includes map selection, state filters, search, a reset control, a scientific note, and a paper citation (without a Selection Summary panel). It supports three separately exported JavaScript GeoJSON datasets:

1. **Municipal lightning fatality incidents** — `Muertes_e` per municipality (1998–2021).
2. **State lightning fatality incidents** — sum of `Muertes_e` for each state (`NOM_ENT`).
3. **Municipal lightning risk** — published 0–4 category stored in `GN_Risk`.

All scientific incident and risk values are read directly from the loaded datasets; the page does not recalculate the risk index. **Lightning incidents count reported events involving at least one fatality rather than individual deaths.**

## Install (no web server needed)

1. Unzip the directory.
2. Copy your **three `.js` files** into the `data/` directory, preserving their **exact filenames and JavaScript variable names** (table below).
3. Double-click `index.html` to open it in a browser. You can also publish the same structure using GitHub Pages.

| File in `data/` | Required global variable | Required feature properties |
| --- | --- | --- |
| `municipal_lightning_incidents.js` | `window.LIGHTNING_MX_DATA` | `ENTIDAD`, `MUN`, `NOM_ENT`, `NOM_MUN`, `Muertes_e` |
| `state_lightning_incidents.js` | `window.LIGHTNING_MX_STATE_DATA` | `ENTIDAD`, `NOM_ENT`, `Muertes_e` |
| `municipal_lightning_risk.js` | `window.LIGHTNING_MX_RISK_DATA` | `ENTIDAD`, `MUN`, `NOM_ENT`, `NOM_MUN`, `GN_Risk` |

The GeoJSON features must have polygon or multipolygon geometries with longitude-latitude coordinates (EPSG:4326). The three scripts are the direct output of the exporter we previously prepared. **Do not rename the global variables.** The web page does not need the `.geojson` copies to run, but you can keep them separately in a public `data/` directory if you wish to share/download the geographic datasets.

If the state JavaScript is missing, municipal data can still be displayed, but the state-border reference overlay will be absent. If a file is missing, the map displays a notice when that dataset is selected; no fabricated data or alternative variable is substituted. The template intentionally contains no datasets. It includes Leaflet 1.9.4 locally under `vendor/leaflet/` (BSD-2-Clause; license bundled), so no CDN, online basemap, API key or local server is required.

## Project structure

```text
LightningRiskMX_Web_3Maps/
├── index.html
├── css/style.css
├── js/map.js
├── data/
│   ├── README.txt
│   ├── municipal_lightning_incidents.js  ← copy here
│   ├── state_lightning_incidents.js      ← copy here
│   └── municipal_lightning_risk.js       ← copy here
├── vendor/leaflet/                    ← leave intact
└── README.md
```

## Functionality

- Choose between municipal incidents, state incidents, and municipal risk.
- Filter any map by state and zoom to the selection.
- Search for a **municipality** on municipal maps or a **state** on the state map.
- Hover or click geographic features for data, with units and labels adapted to the active map.
- Dynamic map legend in the **top-right** corner, including category counts.
- **Noninteractive state-border overlays** on both municipal maps, using the polygons from `state_lightning_incidents.js` (no separate boundary file needed). The outline stays above municipal polygons, even on hover; it does not intercept clicks or popups. When a single state is selected, its outline is shown. The state map itself keeps its original interactive polygons.

- Responsive layout suitable for desktop and mobile screens.

### Classification used for display

The map's **incident counts** are divided into convenient visual categories. These cutoffs are **not asserted to be the original paper's choropleth class breaks**.

- Municipal incidents: `0`, `1`, `2–4`, `5–9`, `10+`.
- State incidents: `0`, `1–9`, `10–24`, `25–49`, `50–99`, `100+`.
- Municipal risk: exact `GN_Risk` values `0` = very low, `1` = low, `2` = moderate, `3` = high, `4` = very high. (Displayed labels are translated into English.)

Simplified boundaries are appropriate for display but should not be used for high-precision GIS computations. The state incident dataset must have been aggregated from municipal `Muertes_e` values as described in your notebook. Check licensing and source acknowledgments for the original municipal geometries before public redistribution.

## Citation

Jaramillo, A., and C. Dominguez (2024): Mapping Lightning Risk in Mexico: Integrating Natural Hazard and Social Vulnerability. *Weather, Climate, and Society*. https://doi.org/10.1175/WCAS-D-23-0151.1
