import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
    extraHTTPHeaders: {
      ...(process.env.CEREBRO_INGEST_TOKEN
        ? { Authorization: `Bearer ${process.env.CEREBRO_INGEST_TOKEN}` }
        : {}),
    },
  },
  projects: [
    {
      name: "api",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
