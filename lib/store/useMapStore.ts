'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ConflictPreset {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  layers: string[];
  dateRange: string;
}

// Layer IDs must match GIBS_LAYERS[].id in lib/utils/constants.ts
export const CONFLICT_PRESETS: ConflictPreset[] = [
  {
    id: 'ukraine-frontline',
    name: 'Ukraine Frontline',
    center: [36.0, 48.5],
    zoom: 7,
    layers: ['MODIS_Terra_CorrectedReflectance_TrueColor', 'VIIRS_SNPP_Thermal_Anomalies_375m_Day'],
    dateRange: 'last-7-days',
  },
  {
    id: 'middle-east-iran',
    name: 'Middle East / Iran',
    center: [53.0, 32.5],
    zoom: 6,
    layers: ['MODIS_Terra_CorrectedReflectance_TrueColor', 'VIIRS_SNPP_Thermal_Anomalies_375m_Day'],
    dateRange: 'last-7-days',
  },
  {
    id: 'gaza-strip',
    name: 'Gaza Strip',
    center: [34.45, 31.42],
    zoom: 10,
    layers: ['MODIS_Terra_CorrectedReflectance_TrueColor', 'MODIS_Terra_Thermal_Anomalies_All'],
    dateRange: 'last-7-days',
  },
  {
    id: 'taiwan-strait',
    name: 'Taiwan Strait',
    center: [120.0, 24.0],
    zoom: 7,
    layers: ['MODIS_Terra_CorrectedReflectance_TrueColor'],
    dateRange: 'last-7-days',
  },
  {
    id: 'sudan-conflict',
    name: 'Sudan Conflict',
    center: [32.5, 15.5],
    zoom: 7,
    layers: ['MODIS_Terra_CorrectedReflectance_TrueColor', 'VIIRS_SNPP_Thermal_Anomalies_375m_Day', 'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance'],
    dateRange: 'last-7-days',
  },
];

interface MapState {
  mapStyle: string;
  center: [number, number];
  zoom: number;
  activeLayers: string[];
  imageryDate: string;
  activePreset: string | null;
  showBeforeAfter: boolean;
  beforeDate: string;
  afterDate: string;
  showAircraft: boolean;
  showShips: boolean;

  setMapStyle: (s: string) => void;
  setCenter: (c: [number, number]) => void;
  setZoom: (z: number) => void;
  toggleLayer: (layer: string) => void;
  setActiveLayers: (layers: string[]) => void;
  setImageryDate: (d: string) => void;
  setActivePreset: (id: string | null) => void;
  setShowBeforeAfter: (v: boolean) => void;
  setBeforeDate: (d: string) => void;
  setAfterDate: (d: string) => void;
  setShowAircraft: (v: boolean) => void;
  setShowShips: (v: boolean) => void;
}

const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      mapStyle: 'carto-dark',
      center: [0, 20],
      zoom: 2,
      activeLayers: [],
      imageryDate: today,
      activePreset: null,
      showBeforeAfter: false,
      beforeDate: weekAgo,
      afterDate: today,
      showAircraft: false,
      showShips: false,

      setMapStyle: (s) => set({ mapStyle: s }),
      setCenter: (c) => set({ center: c }),
      setZoom: (z) => set({ zoom: z }),
      toggleLayer: (layer) =>
        set((state) => ({
          activeLayers: state.activeLayers.includes(layer)
            ? state.activeLayers.filter((l) => l !== layer)
            : [...state.activeLayers, layer],
        })),
      setActiveLayers: (layers) => set({ activeLayers: layers }),
      setImageryDate: (d) => set({ imageryDate: d }),
      setActivePreset: (id) => set({ activePreset: id }),
      setShowBeforeAfter: (v) => set({ showBeforeAfter: v }),
      setBeforeDate: (d) => set({ beforeDate: d }),
      setAfterDate: (d) => set({ afterDate: d }),
      setShowAircraft: (v) => set({ showAircraft: v }),
      setShowShips: (v) => set({ showShips: v }),
    }),
    { name: 'warroom-map' }
  )
);
