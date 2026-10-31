# Shrooms

A fast, mobile-friendly map of about half a million mushroom observations from
[GBIF](https://www.gbif.org), built to help with foraging: where, when and what grows.
For Germany it also includes iNaturalist observations that aren't research grade, which adds about 170k unconfirmed records.

**Live site:** https://kingknecht.github.io/shrooms/ ([source](https://github.com/KingKnecht/shrooms))

- **WebGL rendering** with deck.gl on top of MapLibre. Point and heatmap modes.
  Zoomed out, a screen-space level of detail draws one point per ~2 px cell, instead of hundreds of thousands stacked on top of each other.
- **Filters**: edibility (from Wikidata), season (months), years, type (fungal order),
  country, location accuracy, source, and herbarium specimens on or off. The year filter runs on the GPU.
  The other filters are folded into one per-point mask that is uploaded to the GPU.
  The country filter starts on the browser locale's country (e.g. `de-DE` → Germany) and remembers later choices.
- **Search** across species, genera, families and orders, by scientific name or by English or German common name.
- **Species details**: photo, edibility, regional seasonality chart (for the current map view),
  identification traits (Wikidata mycomorphbox), Wikipedia summary, classification, top countries, and links.
- **In view**: the species with the most records in the current map view.
- Click a point to see the record's date, accuracy, locality, recorder and photo, with a directions link.
- Base maps: dark, light, topographic (OpenTopoMap, shows forests and terrain) and satellite.
- **English and German UI**, picked from the browser language and switchable in the map-style menu (layers button, top right).
  In German, species show their German common names, and Wikipedia text and identification traits are in German where available.

> Never eat a wild mushroom based on a map, an app or a photo. Edibility data comes from
> Wikidata and is incomplete; most species are shown as *unknown*.

## Setup

Requires Node.js 20 or newer.

The processed dataset (`data/build/`) is committed, so after cloning this is enough:

```sh
npm install
npm start            # http://localhost:3000
```

To build a fresh dataset:

```sh
npm run fetch-data   # downloads ~500k records from the GBIF API (10–20 min, resumable)
npm run fetch-inat   # optional: iNaturalist observations without research grade, Germany by default (~30 min)
npm run build-data   # compacts them into binary columns and enriches species from Wikidata
```

`fetch-data` options: `--target 500000` (number of records), `--concurrency 6`, `--from-year 1990`.
To refetch, delete `data/raw/` (or only some `data/raw/<COUNTRY>.ndjson` files) and run it again.
`PORT` and `HOST` environment variables configure the server.

## Hosting on GitHub Pages

`npm run export` writes the whole site as static files to `dist/`, so it needs no server.
In static mode the browser fetches species info directly from GBIF, iNaturalist, Wikipedia and Wikidata.
It also decompresses the gzipped point data itself.

`.github/workflows/pages.yml` runs the export and publishes it on every push to `master`.
To enable it once, go to the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.
The site is then served at `https://<user>.github.io/<repo>/`, for example https://kingknecht.github.io/shrooms/.

To update the data shown online, run `fetch-data` and `build-data`, then commit `data/build/` and push.

To check the export locally, serve `dist/` with any static file server, for example
`npx serve dist` or `python3 -m http.server -d dist`.

## Adding a language

UI texts live in [public/js/i18n.js](public/js/i18n.js). Copy the `de` dictionary, translate it, and add it to
`DICTS` and `LANGUAGES`. Missing keys fall back to English. Month and country names come from the browser (`Intl`).
Species common names are only in the dataset for English and German. Other languages use English names,
but species details still fetch Wikipedia text and trait labels in that language when they exist.

## iNaturalist observations that aren't research grade

Research-grade iNaturalist observations already reach the map through GBIF. `fetch-inat` adds the rest:
"needs ID" and "casual" observations for one place. It keeps only species-level identifications with
coordinates and a date, from 1990 onwards, and skips captive or cultivated ones. Their names are matched
to the GBIF taxonomy, so they share the species tables with the GBIF data. In the app they can be toggled
with the **Source** filter, and their popups say the identification is unconfirmed.

Options: `--place 7207` (an iNaturalist place id; 7207 is Germany), `--country DE` (the country code the
records are filed under), `--from-year 1990`. The download goes at about one request per second, as
iNaturalist asks, and resumes where it left off if interrupted.

## How the data is sampled

The dataset covers mushroom-forming fungi (classes Agaricomycetes, Pezizomycetes, Tremellomycetes and
Dacrymycetes). It leaves out lichens, moulds and eDNA soil samples. It includes georeferenced
observations and specimens from 1990 onwards, with no geospatial issues flagged.

GBIF has about 17 million such records, so `fetch-data` takes a random sample, using the search
API's `shuffle` parameter. The target is split across countries in proportion to
`count^0.6`. That keeps heavily recorded countries (Sweden, the UK, the Netherlands) from crowding
out everywhere else. Countries with few records are downloaded completely. Records without a
species-level identification are dropped.

## Layout

```
scripts/fetch-data.js   GBIF download → data/raw/*.ndjson
scripts/fetch-inat.js   iNaturalist (needs ID / casual) download → data/raw-inat/*.ndjson
scripts/build-data.js   → data/build/{points.bin(.gz/.br), meta.json(.gz/.br), details/N.json}
scripts/export-static.js → dist/ (static site for GitHub Pages)
server/index.js         static files, precompressed data, data/manifest.json, /api/species/:key
server/species.js       disk cache around public/js/species-info.js
public/                 frontend (plain ES modules, no build step)
public/js/species-info.js  species info from GBIF, iNaturalist, Wikipedia and Wikidata (browser and server)
```

`points.bin` holds one typed-array column per field: positions (Float32 lon/lat), species
index, day number, month, coordinate uncertainty, country and record type. The client
wraps these columns without copying them and passes them to deck.gl as binary attributes.

Points are stored in Z-order (Morton order). That lets [public/js/lod.js](public/js/lod.js) assign each
point the coarsest zoom at which it represents its grid cell, in one linear pass per zoom level.
This is recomputed from the points that pass the current filters, so filtering never leaves a cell empty.
Zooming only changes a GPU filter uniform.

## Data credits

Occurrence data: GBIF.org, from many publishing institutions (see each record's GBIF page).
Species info: Wikidata, Wikipedia, iNaturalist. Base maps: CARTO, OpenStreetMap contributors,
OpenTopoMap, Esri.
