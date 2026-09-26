import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  fullyParallel: false,
  workers: 1,
  // Hosted runners render WebGL in software; retain headroom for the full UI flow.
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    channel: "chromium",
    viewport: { width: 960, height: 720 },
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
