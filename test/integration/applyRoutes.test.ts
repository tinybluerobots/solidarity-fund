import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createChallenge, solveChallenge } from "altcha-lib";
import { createApplyRoutes } from "../../src/web/routes/apply.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

describe("apply routes", () => {
	let env: TestEnv;
	let routes: ReturnType<typeof createApplyRoutes>;
	const hmacKey = "test-hmac-key";

	async function generateAltchaToken(): Promise<string> {
		const challenge = await createChallenge({ hmacKey, maxNumber: 10 });
		const solver = solveChallenge(
			challenge.challenge,
			challenge.salt,
			challenge.algorithm,
			challenge.maxnumber,
		);
		const solution = await solver.promise;
		return btoa(
			JSON.stringify({
				algorithm: challenge.algorithm,
				challenge: challenge.challenge,
				number: solution.number,
				salt: challenge.salt,
				signature: challenge.signature,
			}),
		);
	}

	beforeEach(async () => {
		env = await createTestEnv();
		routes = createApplyRoutes(
			env.eventStore,
			env.pool,
			env.applicantRepo,
			hmacKey,
		);
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("showForm returns closed page when no window is open", async () => {
		const res = await routes.showForm();
		const html = await res.text();
		expect(html).toContain("closed");
	});

	test("handleSubmit returns 400 when altcha token is missing", async () => {
		await env.eventStore.appendToStream("lottery-2026-03", [
			{
				type: "ApplicationWindowOpened",
				data: { monthCycle: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
			},
		]);

		const form = new URLSearchParams({
			name: "Alice",
			phone: "07700900001",
			meetingPlace: "Mill Road",
			paymentPreference: "cash",
		});

		const req = new Request("http://localhost/apply", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});

		const res = await routes.handleSubmit(req);
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toContain("verification");
	});

	test("handleSubmit returns 400 when name is missing", async () => {
		const altchaToken = await generateAltchaToken();
		const form = new URLSearchParams({
			phone: "07700900001",
			meetingPlace: "Mill Road",
			paymentPreference: "cash",
		});
		form.set("altcha", altchaToken);

		const req = new Request("http://localhost/apply", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});

		const res = await routes.handleSubmit(req);
		expect(res.status).toBe(400);
	});
});
