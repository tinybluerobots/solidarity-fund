import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createApplicant } from "../../src/domain/applicant/commandHandlers.ts";
import type { ApplicantRepository } from "../../src/domain/applicant/repository.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

describe("Applicant repository queries", () => {
	let env: TestEnv;
	let repo: ApplicantRepository;

	beforeEach(async () => {
		env = await createTestEnv();
		repo = env.applicantRepo;
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("getById returns null for unknown id", async () => {
		const found = await repo.getById("nonexistent");
		expect(found).toBeNull();
	});

	describe("getByPhone", () => {
		test("returns all with matching phone", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				env.eventStore,
			);
			await createApplicant(
				{ phone: "07700900001", name: "Bob" },
				env.eventStore,
			);

			const found = await repo.getByPhone("07700900001");
			expect(found).toHaveLength(2);
		});

		test("returns empty for unknown phone", async () => {
			const found = await repo.getByPhone("00000000000");
			expect(found).toHaveLength(0);
		});
	});

	describe("getByPhoneAndName", () => {
		test("returns exact match", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				env.eventStore,
			);

			const found = await repo.getByPhoneAndName("07700900001", "Alice");
			expect(found).not.toBeNull();
			expect(found!.name).toBe("Alice");
		});

		test("returns null for different name", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				env.eventStore,
			);

			const found = await repo.getByPhoneAndName("07700900001", "Bob");
			expect(found).toBeNull();
		});
	});

	describe("list", () => {
		test("returns all applicants", async () => {
			await createApplicant(
				{ phone: "07700900001", name: "Alice" },
				env.eventStore,
			);
			await createApplicant(
				{ phone: "07700900002", name: "Bob" },
				env.eventStore,
			);

			const all = await repo.list();
			expect(all).toHaveLength(2);
		});

		test("returns empty array when no applicants", async () => {
			const all = await repo.list();
			expect(all).toHaveLength(0);
		});
	});
});
