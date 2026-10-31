// MapLibre base map with a deck.gl WebGL overlay for the occurrence points.

const { MapboxOverlay, ScatterplotLayer, HeatmapLayer, DataFilterExtension } = window.deck;

const raster = (tiles, attribution, maxzoom = 19) => ({
  version: 8,
  sources: { base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

export const BASEMAPS = [
  {
    id: 'dark',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
  {
    id: 'light',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  {
    id: 'topo',
    style: raster(
      ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      17,
    ),
  },
  {
    id: 'satellite',
    style: raster(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    ),
  },
];

// Transparent at the low end so sparse areas don't tint the whole base map.
const HEAT_COLORS = [
  [120, 60, 35, 0],
  [160, 75, 38, 110],
  [200, 95, 45, 170],
  [226, 118, 63, 210],
  [245, 170, 90, 235],
  [255, 228, 170, 250],
];

export class OccurrenceMap {
  constructor(container, { onClick, getTooltip, onViewChange }) {
    this.basemap = BASEMAPS[0].id;
    this.map = new maplibregl.Map({
      container,
      style: BASEMAPS[0].style,
      center: [10, 50],
      zoom: 3.3,
      minZoom: 1,
      maxZoom: 19,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true,
      // Keeps the view in the URL (#map=zoom/lat/lon) so links can be shared.
      hash: 'map',
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      fitBoundsOptions: { maxZoom: 11 },
    });
    this.map.addControl(this.geolocate, 'top-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    this.overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onClick,
      getTooltip,
      pickingRadius: 6,
    });
    this.map.addControl(this.overlay);

    let pending = 0;
    this.map.on('moveend', () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => onViewChange?.());
    });

    this.ready = new Promise((resolve) => this.map.once('load', resolve));
    this.layerState = null;
  }

  setBasemap(id) {
    const basemap = BASEMAPS.find((b) => b.id === id);
    if (!basemap || basemap.id === this.basemap) return;
    this.basemap = id;
    this.map.setStyle(basemap.style);
  }

  bounds() {
    const b = this.map.getBounds();
    let west = b.getWest();
    let east = b.getEast();
    if (east - west >= 360) return [-180, b.getSouth(), 180, b.getNorth()];
    const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
    west = wrap(west);
    east = wrap(east);
    return [west, b.getSouth(), east, b.getNorth()];
  }

  // `s` holds the typed arrays and settings; rebuilt layers are cheap because the
  // data objects (and thus GPU buffers) only change when the arrays change.
  render(s) {
    const layers = [];
    if (s.mode === 'heatmap') {
      layers.push(
        new HeatmapLayer({
          id: 'heat',
          data: s.heatData,
          radiusPixels: 22,
          intensity: 1.4,
          threshold: 0.02,
          colorRange: HEAT_COLORS,
          aggregation: 'SUM',
          debounceTimeout: 120,
        }),
      );
    } else {
      layers.push(
        new ScatterplotLayer({
          id: 'points',
          data: s.pointData,
          radiusUnits: 'meters',
          getRadius: s.focused ? 160 : 90,
          radiusMinPixels: s.focused ? 2.6 : 1.4,
          radiusMaxPixels: 9,
          stroked: true,
          lineWidthUnits: 'pixels',
          getLineWidth: 0.6,
          getLineColor: [12, 9, 6, 160],
          lineWidthMaxPixels: 1,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 230],
          extensions: [new DataFilterExtension({ filterSize: 2 })],
          filterRange: [s.dayRange, [0.5, 1.5]],
        }),
      );
    }
    this.overlay.setProps({ layers });
  }
}
