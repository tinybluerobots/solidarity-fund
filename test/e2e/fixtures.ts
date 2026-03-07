import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Fixtures = {
	serverInstance: void;
	login: (page: Page) => Promise<void>;
};

export const test = base.extend<Fixtures>({
	serverInstance: [
		async ({}, use) => {
			const serverPath = path.resolve(__dirname, "testServer.ts");
			const proc: ChildProcess = spawn("bun", ["run", serverPath], {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, TEST_PORT: "3001" },
			});

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error("Server start timeout")),
					15000,
				);
				proc.stdout?.on("data", (data: Buffer) => {
					if (data.toString().includes("TEST_SERVER_READY")) {
						clearTimeout(timeout);
						resolve();
					}
				});
				proc.stderr?.on("data", (data: Buffer) => {
					const msg = data.toString();
					if (msg.includes("error") || msg.includes("Error")) {
						clearTimeout(timeout);
						reject(new Error(`Server error: ${msg}`));
					}
				});
				proc.on("error", (err) => {
					clearTimeout(timeout);
					reject(err);
				});
			});

			await use();

			proc.kill("SIGTERM");
			// Wait for process to exit to free port
			await new Promise<void>((resolve) => {
				proc.on("exit", resolve);
				setTimeout(resolve, 2000);
			});
		},
		{ scope: "test" },
	],

	login: async ({}, use) => {
		await use(async (page: Page) => {
			await page.goto("/login");
			await page.locator("#name").fill("Test");
			await page.locator("#password").fill("test");
			await page.locator('button[type="submit"]').click();
			await page.waitForURL("/");
		});
	},
});

export { expect } from "@playwright/test";
