import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.isaacdev.com",
  appName: "liss-tv",
  server: {
    url: "http://192.168.1.15:3000",
    cleartext: false,
  },
};

export default config;
