import type { Trail } from '@/lib/geo';
import type { Region } from 'react-native-maps';

let _trails: Trail[] = [];
let _areaLabel = '';
let _visibleRegion: Region | null = null;
let _heading = 0;

export function setExportData(
  trails: Trail[],
  areaLabel: string,
  visibleRegion: Region | null,
  heading = 0,
) {
  _trails = trails;
  _areaLabel = areaLabel;
  _visibleRegion = visibleRegion;
  _heading = heading;
}

export function getExportData() {
  return {
    trails: _trails,
    areaLabel: _areaLabel,
    visibleRegion: _visibleRegion,
    heading: _heading,
  };
}

export function clearExportData() {
  _trails = [];
  _areaLabel = '';
  _visibleRegion = null;
  _heading = 0;
}
