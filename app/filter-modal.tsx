import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Fonts } from "@/constants/theme";
import { getDistinctAreas, getTrailDateRange, getLastTrailLocation } from "@/lib/db";
import { getFilters, setFilters, hasActiveFilters } from "@/lib/filter-store";
import { useTranslation } from "@/contexts/language";

const PRESETS = [
  { labelKey: "filter.preset.1d", days: 1 },
  { labelKey: "filter.preset.1w", days: 7 },
  { labelKey: "filter.preset.1m", days: 30 },
  { labelKey: "filter.preset.1y", days: 365 },
  { labelKey: "filter.preset.all", days: 3650 },
] as const;

const ACTIVITIES = [
  { type: 37, labelKey: "activity.running" },
  { type: 52, labelKey: "activity.walking" },
  { type: 13, labelKey: "activity.cycling" },
  { type: 24, labelKey: "activity.hiking" },
  { type: 46, labelKey: "activity.swimming" },
] as const;

interface CityEntry {
  city: string;
  count: number;
}

interface RegionGroup {
  region: string;
  cities: CityEntry[];
  totalCount: number;
}

interface CountryGroup {
  country: string;
  regions: RegionGroup[];
  totalCount: number;
}

export default function FilterModal() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const router = useRouter();
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const currentFilters = getFilters();

  const [startDate, setStartDate] = useState(currentFilters.startDate);
  const [endDate, setEndDate] = useState(currentFilters.endDate);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(
    currentFilters.country,
  );
  const [selectedRegion, setSelectedRegion] = useState<string | null>(
    currentFilters.region,
  );
  const [selectedCity, setSelectedCity] = useState<string | null>(
    currentFilters.city,
  );
  const [selectedActivities, setSelectedActivities] = useState<number[]>(
    currentFilters.activityTypes ?? [],
  );
  const [areas, setAreas] = useState<
    { country: string; region: string; city: string; count: number }[]
  >([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [expandedCountries, setExpandedCountries] = useState<Set<number>>(
    new Set(),
  );
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(
    new Set(),
  );
  const [dbDateRange, setDbDateRange] = useState<{
    minDate: Date;
    maxDate: Date;
  } | null>(null);

  const countryGroups = useMemo((): CountryGroup[] => {
    const countryMap = new Map<
      string,
      Map<string, { city: string; count: number }[]>
    >();

    for (const a of areas) {
      if (!countryMap.has(a.country)) countryMap.set(a.country, new Map());
      const regionMap = countryMap.get(a.country)!;
      if (!regionMap.has(a.region)) regionMap.set(a.region, []);
      regionMap.get(a.region)!.push({ city: a.city, count: a.count });
    }

    const result: CountryGroup[] = [];
    for (const [country, regionMap] of countryMap) {
      const regions: RegionGroup[] = [];
      for (const [region, cities] of regionMap) {
        const sorted = cities.sort((a, b) => b.count - a.count);
        const totalCount = sorted.reduce((s, c) => s + c.count, 0);
        regions.push({ region, cities: sorted, totalCount });
      }
      regions.sort((a, b) => b.totalCount - a.totalCount);
      const totalCount = regions.reduce((s, r) => s + r.totalCount, 0);
      result.push({ country, regions, totalCount });
    }

    return result.sort((a, b) => b.totalCount - a.totalCount);
  }, [areas]);

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      setLoadingAreas(true);
      const [distinctAreas, dateRange] = await Promise.all([
        getDistinctAreas(
          db,
          startDate,
          endDate,
          selectedActivities.length > 0 ? selectedActivities : null,
        ),
        getTrailDateRange(db),
      ]);
      if (cancelled) return;

      setAreas(distinctAreas);
      setDbDateRange(dateRange);
      setLoadingAreas(false);
    }

    loadAreas();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, startDate.getTime(), endDate.getTime(), selectedActivities]);

  // Auto-select last workout's city when no filter is active
  useEffect(() => {
    if (loadingAreas || hasActiveFilters()) return;

    getLastTrailLocation(db).then((loc) => {
      if (!loc) return;
      setSelectedCountry(loc.country);
      setSelectedRegion(loc.region);
      setSelectedCity(loc.city);
    });
  }, [loadingAreas, db]);

  // Auto-expand to match selection on initial load only
  const didAutoExpand = useRef(false);
  useEffect(() => {
    if (loadingAreas || didAutoExpand.current) return;
    if (!selectedCountry) return;
    didAutoExpand.current = true;

    for (let cIdx = 0; cIdx < countryGroups.length; cIdx++) {
      if (countryGroups[cIdx].country === selectedCountry) {
        setExpandedCountries(new Set([cIdx]));
        if (selectedRegion) {
          for (let rIdx = 0; rIdx < countryGroups[cIdx].regions.length; rIdx++) {
            if (countryGroups[cIdx].regions[rIdx].region === selectedRegion) {
              setExpandedRegions(new Set([`${cIdx}-${rIdx}`]));
              break;
            }
          }
        }
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAreas, selectedCountry]);

  const selectCountry = (country: string) => {
    setSelectedCountry(country);
    setSelectedRegion(null);
    setSelectedCity(null);
  };

  const selectRegion = (country: string, region: string) => {
    setSelectedCountry(country);
    setSelectedRegion(region);
    setSelectedCity(null);
  };

  const selectCity = (country: string, region: string, city: string) => {
    setSelectedCountry(country);
    setSelectedRegion(region);
    setSelectedCity(city);
  };

  const getActivePresetDays = () => {
    if (dbDateRange) {
      const isAllPreset =
        Math.abs(startDate.getTime() - dbDateRange.minDate.getTime()) < 1000 &&
        Math.abs(endDate.getTime() - dbDateRange.maxDate.getTime()) < 1000;
      if (isAllPreset) return 3650;
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return (
      PRESETS.find((p) => p.days !== 3650 && Math.abs(p.days - diffDays) <= 1)
        ?.days ?? null
    );
  };

  const handlePreset = async (days: number) => {
    const now = new Date();

    if (days >= 3650) {
      const dateRange = await getTrailDateRange(db);
      if (dateRange) {
        setStartDate(dateRange.minDate);
        setEndDate(dateRange.maxDate);
      } else {
        const start = new Date(
          now.getTime() - (days / 2) * 24 * 60 * 60 * 1000,
        );
        const end = new Date(now.getTime() + (days / 2) * 24 * 60 * 60 * 1000);
        setStartDate(start);
        setEndDate(end);
      }
    } else {
      const end = now;
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      setStartDate(start);
      setEndDate(end);
    }
  };

  const toggleActivity = (type: number) => {
    setSelectedActivities((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleApply = () => {
    setFilters({
      startDate,
      endDate,
      country: selectedCountry,
      region: selectedRegion,
      city: selectedCity,
      activityTypes: selectedActivities.length > 0 ? selectedActivities : null,
    });
    router.back();
  };

  const toggleCountry = (idx: number) => {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleRegion = (key: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activePresetDays = getActivePresetDays();

  const renderCountryGroup = (group: CountryGroup, cIdx: number) => {
    const isLast = cIdx === countryGroups.length - 1;
    const isExpanded = expandedCountries.has(cIdx);
    const countrySelected =
      selectedCountry === group.country && !selectedRegion && !selectedCity;
    const singleRegion = group.regions.length === 1;

    return (
      <View key={cIdx}>
        {/* Country row */}
        <TouchableOpacity
          style={[
            styles.areaRow,
            !isExpanded &&
              !isLast && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.borderLight,
              },
          ]}
          onPress={() => {
            const isCurrentCountry = selectedCountry === group.country;
            const hasSubSelection = isCurrentCountry && (selectedRegion || selectedCity);
            if (hasSubSelection) {
              // Elevate to country-level selection, keep expanded
              selectCountry(group.country);
            } else {
              selectCountry(group.country);
              toggleCountry(cIdx);
            }
          }}
        >
          <View
            style={[
              styles.radio,
              {
                borderColor: countrySelected
                  ? colors.accent
                  : colors.textSecondary,
                backgroundColor: countrySelected
                  ? colors.accent
                  : "transparent",
              },
            ]}
          />
          <Text
            style={[
              styles.areaLabel,
              { color: colors.text, fontFamily: Fonts.bold },
            ]}
            numberOfLines={1}
          >
            {group.country}
          </Text>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>
            {isExpanded ? "\u25B4" : "\u25BE"}
          </Text>
          <View
            style={[
              styles.countPill,
              { borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Text style={[styles.countPillText, { color: colors.text }]}>
              {group.totalCount}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Expanded content */}
        {isExpanded && singleRegion
          ? // Single-region with multiple cities → skip region level, show cities directly
            group.regions[0].cities.map((city, cityIdx) => {
              const cityIsLast =
                cityIdx === group.regions[0].cities.length - 1 && isLast;
              const cityActive =
                selectedCountry === group.country &&
                selectedRegion === group.regions[0].region &&
                selectedCity === city.city;

              return (
                <TouchableOpacity
                  key={cityIdx}
                  style={[
                    styles.areaRow,
                    styles.subAreaRow,
                    !cityIsLast && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.borderLight,
                    },
                  ]}
                  onPress={() =>
                    selectCity(
                      group.country,
                      group.regions[0].region,
                      city.city,
                    )
                  }
                >
                  <View
                    style={[
                      styles.radioSmall,
                      {
                        borderColor: cityActive
                          ? colors.accent
                          : colors.textSecondary,
                        backgroundColor: cityActive
                          ? colors.accent
                          : "transparent",
                      },
                    ]}
                  />
                  <Text
                    style={[styles.areaLabel, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {city.city}
                  </Text>
                  <View
                    style={[
                      styles.countPill,
                      { borderColor: colors.border, borderWidth: 1 },
                    ]}
                  >
                    <Text
                      style={[styles.countPillText, { color: colors.text }]}
                    >
                      {city.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          : // Multi-region → full 3-level
            isExpanded &&
            group.regions.map((region, rIdx) => {
              const regionKey = `${cIdx}-${rIdx}`;
              const regionExpanded = expandedRegions.has(regionKey);
              const regionSelected =
                selectedCountry === group.country &&
                selectedRegion === region.region &&
                !selectedCity;
              const regionIsLastInGroup = rIdx === group.regions.length - 1;

              return (
                <View key={rIdx}>
                  {/* Region row */}
                  <TouchableOpacity
                    style={[
                      styles.areaRow,
                      styles.subAreaRow,
                      !regionExpanded &&
                        !(regionIsLastInGroup && isLast) && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.borderLight,
                        },
                    ]}
                    onPress={() => {
                      selectRegion(group.country, region.region);
                      toggleRegion(regionKey);
                    }}
                  >
                    <View
                      style={[
                        styles.radioSmall,
                        {
                          borderColor: regionSelected
                            ? colors.accent
                            : colors.textSecondary,
                          backgroundColor: regionSelected
                            ? colors.accent
                            : "transparent",
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.areaLabel,
                        { color: colors.text, fontFamily: Fonts.medium },
                      ]}
                      numberOfLines={1}
                    >
                      {region.region}
                    </Text>
                    <Text
                      style={[styles.chevron, { color: colors.textSecondary }]}
                    >
                      {regionExpanded ? "\u25B4" : "\u25BE"}
                    </Text>
                    <View
                      style={[
                        styles.countPill,
                        { borderColor: colors.border, borderWidth: 1 },
                      ]}
                    >
                      <Text
                        style={[styles.countPillText, { color: colors.text }]}
                      >
                        {region.totalCount}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* City rows */}
                  {regionExpanded &&
                    region.cities.map((city, cityIdx) => {
                      const cityIsLast =
                        cityIdx === region.cities.length - 1 &&
                        regionIsLastInGroup &&
                        isLast;
                      const cityActive =
                        selectedCountry === group.country &&
                        selectedRegion === region.region &&
                        selectedCity === city.city;

                      return (
                        <TouchableOpacity
                          key={cityIdx}
                          style={[
                            styles.areaRow,
                            styles.subSubAreaRow,
                            !cityIsLast && {
                              borderBottomWidth: StyleSheet.hairlineWidth,
                              borderBottomColor: colors.borderLight,
                            },
                          ]}
                          onPress={() =>
                            selectCity(
                              group.country,
                              region.region,
                              city.city,
                            )
                          }
                        >
                          <View
                            style={[
                              styles.radioSmall,
                              {
                                borderColor: cityActive
                                  ? colors.accent
                                  : colors.textSecondary,
                                backgroundColor: cityActive
                                  ? colors.accent
                                  : "transparent",
                              },
                            ]}
                          />
                          <Text
                            style={[styles.areaLabel, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {city.city}
                          </Text>
                          <View
                            style={[
                              styles.countPill,
                              { borderColor: colors.border, borderWidth: 1 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.countPillText,
                                { color: colors.text },
                              ]}
                            >
                              {city.count}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              );
            })}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      {/* Drag handle */}
      <View style={styles.handleContainer}>
        <View
          style={[styles.handle, { backgroundColor: colors.borderLight }]}
        />
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* Date range section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("filter.dateRange")}
        </Text>

        <View style={styles.presetRow}>
          {PRESETS.map((preset) => {
            const isActive = activePresetDays === preset.days;
            return (
              <TouchableOpacity
                key={preset.days}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isActive ? colors.accent : "transparent",
                    borderColor: isActive
                      ? colors.activeSelectionBorder
                      : colors.border,
                  },
                ]}
                onPress={() => handlePreset(preset.days)}
              >
                <Text
                  style={[
                    styles.presetText,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  {t(preset.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View
          style={[
            styles.datePickerRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.datePickerCol}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              {t("filter.from")}
            </Text>
            <DateTimePicker
              value={startDate}
              mode="date"
              display="compact"
              maximumDate={endDate}
              onChange={(_, date) => {
                if (date) setStartDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.text}
            />
          </View>
          <View style={styles.datePickerCol}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              {t("filter.to")}
            </Text>
            <DateTimePicker
              value={endDate}
              mode="date"
              display="compact"
              minimumDate={startDate}
              onChange={(_, date) => {
                if (date) setEndDate(date);
              }}
              themeVariant={colorScheme}
              accentColor={colors.text}
            />
          </View>
        </View>

        {/* Activities section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("filter.activities")}
        </Text>
        <View style={styles.activityWrap}>
          {ACTIVITIES.map((act) => {
            const isActive = selectedActivities.includes(act.type);
            return (
              <TouchableOpacity
                key={act.type}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isActive ? colors.accent : "transparent",
                    borderColor: isActive
                      ? colors.activeSelectionBorder
                      : colors.border,
                  },
                ]}
                onPress={() => toggleActivity(act.type)}
              >
                <Text style={[styles.presetText, { color: colors.text }]}>
                  {t(act.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Areas section */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {t("filter.areas")}
        </Text>

        {loadingAreas ? (
          <View style={styles.areaLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text
              style={[styles.areaLoadingText, { color: colors.textSecondary }]}
            >
              {t("filter.loadingAreas")}
            </Text>
          </View>
        ) : countryGroups.length === 0 ? (
          <View style={styles.areaLoading}>
            <Text
              style={[styles.areaLoadingText, { color: colors.textSecondary }]}
            >
              {t("filter.noAreasMatch")}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.areaCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {countryGroups.map((group, cIdx) =>
              renderCountryGroup(group, cIdx),
            )}
          </View>
        )}
      </ScrollView>

      {/* Apply button — always at bottom */}
      <View style={styles.applyContainer}>
        <TouchableOpacity
          style={[
            styles.applyButton,
            {
              backgroundColor: colors.accent,
              borderColor: colors.activeSelectionBorder,
              opacity: selectedCountry === null ? 0.4 : 1,
            },
          ]}
          onPress={handleApply}
          disabled={selectedCountry === null}
        >
          <Text style={[styles.applyButtonText, { color: colors.text }]}>
            {t("filter.apply")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  areaLoading: {
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  areaLoadingText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 8,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  activityWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 2,
  },
  presetText: {
    fontFamily: Fonts.semibold,
    fontSize: 13,
  },
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 32,
    borderWidth: 2,
    overflow: "hidden",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  datePickerCol: {
    flex: 1,
    alignItems: "flex-start",
    gap: 4,
    transform: [{ scale: 0.85 }],
  },
  dateLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    letterSpacing: 1,
  },
  areaCard: {
    borderRadius: 32,
    borderWidth: 2,
    overflow: "hidden",
  },
  areaRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  subAreaRow: {
    paddingLeft: 40,
  },
  subSubAreaRow: {
    paddingLeft: 64,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  radioSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  areaLabel: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countPillText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  chevron: {
    fontSize: 14,
    marginLeft: 4,
  },
  applyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundBlendMode: "overlay",
  },
  applyButton: {
    borderWidth: 2,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  applyButtonText: {
    fontFamily: Fonts.semibold,
    fontSize: 17,
  },
});
