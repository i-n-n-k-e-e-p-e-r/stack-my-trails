import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#212529",
    textSecondary: "#6C757D",
    background: "#F5F6F7",
    surface: "#FFFFFF",
    accent: "#FCC803",
    icon: "#6C757D",
    tabIconDefault: "#ADB5BD",
    tabIconSelected: "#212529",
    border: "#212529",
    borderLight: "#DEE2E6",
    danger: "#DC2626",
    // Dark ink trails on pale map
    trailStroke: "rgba(33,37,41,0.9)",
    trailStrokeStacked: "rgba(33,37,41,0.5)",
    // Dark text on yellow accent buttons
    buttonText: "#212529",
    activeSelectionBorder: "#212529",
  },
  dark: {
    text: "#FFFFFF",
    textSecondary: "#ADB5BD",
    background: "#212529",
    surface: "#2D3238",
    accent: "#6C757D",
    icon: "#ADB5BD",
    tabIconDefault: "#6C757D",
    tabIconSelected: "#FFFFFF",
    border: "#495057",
    borderLight: "#495057",
    danger: "#EF4444",
    // Bright accent trails on dark map
    trailStroke: "rgba(252,200,3,0.95)",
    trailStrokeStacked: "rgba(252,200,3,0.5)",
    // Dark text on yellow accent buttons
    buttonText: "#212529",
    activeSelectionBorder: "#ADB5BD",
  },
};

export const Fonts = {
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  semibold: "Geist-SemiBold",
  bold: "Geist-Bold",
  system: Platform.select({
    ios: "System",
    default: "sans-serif",
  }),
};
