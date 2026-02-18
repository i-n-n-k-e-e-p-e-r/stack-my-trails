const { withXcodeProject } = require('@expo/config-plugins');

// Set iOS deployment target to 16.0 and restrict to iPhone only (no Mac, no visionOS)
const withDeploymentTarget = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const bc = configurations[key];
      if (!bc.buildSettings) continue;
      if (bc.buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
        bc.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
      }
      // iPhone only, no iPad/Mac/visionOS
      bc.buildSettings.TARGETED_DEVICE_FAMILY = '1';
      bc.buildSettings.SUPPORTS_MACCATALYST = 'NO';
      bc.buildSettings.SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = 'NO';
      bc.buildSettings.SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = 'NO';
    }
    return config;
  });

module.exports = (config) => {
  config = withDeploymentTarget(config);
  return config;
};
