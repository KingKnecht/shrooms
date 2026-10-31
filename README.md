# Shrooms

A fast, mobile-friendly map of about half a million mushroom observations from
[GBIF](https://www.gbif.org), built to help with foraging: where, when and what grows.

**Live site:** https://kingknecht.github.io/shrooms/ ([source](https://github.com/KingKnecht/shrooms))

- **WebGL rendering** of every point with deck.gl on top of MapLibre. Point and heatmap modes.
- **Filters**: edibility (from Wikidata), season (months), years, type (fungal order),
  country, location accuracy, and herbarium specimens on or off. The year filter runs on the GPU.
  The other filters are folded into one per-point mask that is uploaded to the GPU.
- **Search** across species, genera, families and orders, by scientific name or by English or German common name.
- **Species details**: photo, edibility, regional seasonality chart (for the current map view),
  identification traits (Wikidata mycomorphbox), Wikipedia summary, classification, top countries, and links.
- **In view**: the species with the most records in the current map view.
- Click a point to see the record's date, accuracy, locality, recorder and photo, with a directions link.
- Base maps: dark, light, topographic (OpenTopoMap, shows forests and terrain) and satellite.

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

## Data credits

Occurrence data: GBIF.org, from many publishing institutions (see each record's GBIF page).
Species info: Wikidata, Wikipedia, iNaturalist. Base maps: CARTO, OpenStreetMap contributors,
OpenTopoMap, Esri.
