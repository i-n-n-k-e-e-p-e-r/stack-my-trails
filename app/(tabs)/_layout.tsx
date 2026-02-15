import { Tabs } from "expo-router";
import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const TAB_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> =
  {
    index: "map-pin",
    stack: "layers",
    settings: "settings",
  };

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarWrapper, { bottom: insets.bottom + 12 }]}>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 2,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const iconName = TAB_ICONS[route.name] ?? "circle";

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={styles.tabButton}
            >
              <View
                style={[
                  styles.iconCircle,
                  focused && {
                    backgroundColor: colors.accent,
                    borderColor: colors.activeSelectionBorder,
                    borderWidth: 2,
                  },
                ]}
              >
                <Feather name={iconName} size={26} color={colors.text} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      initialRouteName="stack"
    >
      <Tabs.Screen name="stack" options={{ title: "Stack" }} />
      <Tabs.Screen name="index" options={{ title: "Trails" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 12,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
