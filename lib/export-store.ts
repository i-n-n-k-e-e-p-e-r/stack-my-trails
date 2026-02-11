import type { Trail } from '@/lib/geo';
import type { Region } from 'react-native-maps';

let _trails: Trail[] = [];
let _areaLabel = '';
let _visibleRegion: Region | null = null;

export function setExportData(
  trails: Trail[],
  areaLabel: string,
  visibleRegion: Region | null,
) {
  _trails = trails;
  _areaLabel = areaLabel;
  _visibleRegion = visibleRegion;
}

export function getExportData() {
  return {
    trails: _trails,
    areaLabel: _areaLabel,
    visibleRegion: _visibleRegion,
  };
}

export function clearExportData() {
  _trails = [];
  _areaLabel = '';
  _visibleRegion = null;
}
