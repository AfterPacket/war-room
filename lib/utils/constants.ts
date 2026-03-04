export const GIBS_LAYERS = [
  {
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    name: 'MODIS True Color',
    description: 'Daily true color satellite imagery from Terra',
    maxZoom: 9,
    urlTemplate: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
  },
  {
    id: 'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance',
    name: 'VIIRS Nighttime Lights',
    description: 'Visible lights from cities and fires at night',
    maxZoom: 8,
    urlTemplate: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_At_Sensor_Radiance/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
  },
  {
    id: 'MODIS_Terra_Thermal_Anomalies_All',
    name: 'Active Fires (MODIS Terra)',
    description: 'Thermal anomalies and active fire hotspots',
    maxZoom: 7,
    urlTemplate: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Thermal_Anomalies_All/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
  },
  {
    id: 'VIIRS_SNPP_Thermal_Anomalies_375m_Day',
    name: 'Active Fires (VIIRS Day)',
    description: 'High-resolution daytime thermal anomalies',
    maxZoom: 8,
    urlTemplate: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Thermal_Anomalies_375m_Day/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
  },
];

export const MAP_STYLES = [
  { id: 'carto-dark', name: 'Dark' },
  { id: 'esri-satellite', name: 'Satellite' },
  { id: 'carto-voyager', name: 'Streets' },
  { id: 'osm-standard', name: 'Terrain' },
];

type RasterSource = { type: 'raster'; tiles: string[]; tileSize: number; attribution: string };
type StyleSpec = { version: 8; sources: { base: RasterSource }; layers: { id: string; type: 'raster'; source: string }[] };

// All tile requests route through /api/tiles/... (same-origin proxy)
// so ad blockers and firewalls cannot interfere.
// `origin` must be an absolute base (e.g. window.location.origin) so MapLibre's
// worker thread resolves tile URLs correctly instead of relative-to-worker-script.
export function getMapStyle(styleId: string, origin: string): StyleSpec {
  const layer = { id: 'base', type: 'raster' as const, source: 'base' };
  const sources: Record<string, RasterSource> = {
    'carto-dark': {
      type: 'raster',
      tiles: [`${origin}/api/tiles/carto-dark/{z}/{x}/{y}`],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
    'esri-satellite': {
      type: 'raster',
      tiles: [`${origin}/api/tiles/esri-satellite/{z}/{x}/{y}`],
      tileSize: 256,
      attribution: '&copy; Esri, DigitalGlobe, GeoEye, USDA, USGS',
    },
    'carto-voyager': {
      type: 'raster',
      tiles: [`${origin}/api/tiles/carto-voyager/{z}/{x}/{y}`],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
    'osm-standard': {
      type: 'raster',
      tiles: [`${origin}/api/tiles/osm-standard/{z}/{x}/{y}`],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  };
  const source = sources[styleId] ?? sources['carto-dark'];
  return { version: 8, sources: { base: source }, layers: [layer] };
}

export const REGION_PRESETS = [
  { name: 'Global',       center: [0,    20] as [number, number], zoom: 2 },
  { name: 'USA',          center: [-98,  38] as [number, number], zoom: 4 },
  { name: 'Europe',       center: [15,   52] as [number, number], zoom: 4 },
  { name: 'Middle East',  center: [43,   30] as [number, number], zoom: 5 },
  { name: 'Russia',       center: [60,   62] as [number, number], zoom: 3 },
  { name: 'China',        center: [108,  35] as [number, number], zoom: 4 },
  { name: 'Africa',       center: [20,    5] as [number, number], zoom: 3 },
  { name: 'Indo-Pacific', center: [140,  15] as [number, number], zoom: 3 },
];
