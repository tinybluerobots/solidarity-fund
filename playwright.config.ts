import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "test/e2e",
	timeout: 30_000,
	use: {
		baseURL: "http://localhost:3001",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
