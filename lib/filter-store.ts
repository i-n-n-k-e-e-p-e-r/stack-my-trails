type Listener = () => void;

export interface FilterState {
  startDate: Date;
  endDate: Date;
  areaLabels: string[] | null;
  areaLabel: string | null;
  activityTypes: number[] | null;
}

// Default: 1 year date range, no area selected (= no trails shown)
function defaultState(): FilterState {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  return { startDate: start, endDate: end, areaLabels: null, areaLabel: null, activityTypes: null };
}

let _state: FilterState = defaultState();

const _listeners = new Set<Listener>();

export function getFilters(): FilterState {
  return _state;
}

/** True when an area has been selected (trails will be shown). */
export function hasActiveFilters(): boolean {
  return _state.areaLabels !== null && _state.areaLabels.length > 0;
}

export function setFilters(update: Partial<FilterState>) {
  _state = { ..._state, ...update };
  _listeners.forEach((fn) => fn());
}

export function resetFilters() {
  _state = defaultState();
  _listeners.forEach((fn) => fn());
}

export function subscribeFilters(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
