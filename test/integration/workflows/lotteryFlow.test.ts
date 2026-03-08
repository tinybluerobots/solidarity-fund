import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { toApplicantId } from "../../../src/domain/application/applicantId.ts";
import { checkEligibility } from "../../../src/domain/application/checkEligibility.ts";
import type { ApplicationEvent } from "../../../src/domain/application/types.ts";
import { createTestEnv, type TestEnv } from "../helpers/testEventStore.ts";
import {
	closeWindow,
	drawLottery,
	openWindow,
	processDrawResults,
	queryApplications,
	submitAcceptedApplication,
} from "../helpers/workflowSteps.ts";

describe("lottery workflow", () => {
	let env: TestEnv;

	beforeEach(async () => {
		env = await createTestEnv();
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("full flow: 5 applicants → open → close → draw → 3 selected + 2 not_selected", async () => {
		const applicants = [
			{ id: "app-1", phone: "07700900001", name: "Alice" },
			{ id: "app-2", phone: "07700900002", name: "Bob" },
			{ id: "app-3", phone: "07700900003", name: "Charlie" },
			{ id: "app-4", phone: "07700900004", name: "Diana" },
			{ id: "app-5", phone: "07700900005", name: "Eve" },
		];

		for (const a of applicants) {
			await submitAcceptedApplication(env, {
				applicationId: a.id,
				phone: a.phone,
				name: a.name,
				monthCycle: "2026-03",
			});
		}

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		const pool = await env.pool.withConnection(async (conn) =>
			conn.query<{ id: string; applicant_id: string }>(
				"SELECT id, applicant_id FROM applications WHERE month_cycle = ? AND status = 'accepted'",
				["2026-03"],
			),
		);

		// balance=120, grant=40 → 3 winners
		const drawn = await drawLottery(env, {
			monthCycle: "2026-03",
			applicantPool: pool.map((a) => ({
				applicationId: a.id,
				applicantId: a.applicant_id,
			})),
			availableBalance: 120,
			grantAmount: 40,
		});

		expect(drawn.type).toBe("LotteryDrawn");
		expect(drawn.data.selected).toHaveLength(3);
		expect(drawn.data.notSelected).toHaveLength(2);

		await processDrawResults(env, drawn);

		// Verify selected
		for (const s of drawn.data.selected) {
			const { events } = await env.eventStore.readStream<ApplicationEvent>(
				`application-${s.applicationId}`,
			);
			const selected = events.find((e) => e.type === "ApplicationSelected");
			expect(selected).toBeDefined();
			expect(selected!.data.rank).toBe(s.rank);
		}

		// Verify not selected
		for (const ns of drawn.data.notSelected) {
			const { events } = await env.eventStore.readStream<ApplicationEvent>(
				`application-${ns.applicationId}`,
			);
			expect(
				events.find((e) => e.type === "ApplicationNotSelected"),
			).toBeDefined();
		}

		// Projection: statuses updated
		const apps = await queryApplications(env);
		const selectedApps = apps.filter((a) => a.status === "selected");
		const notSelectedApps = apps.filter((a) => a.status === "not_selected");
		expect(selectedApps).toHaveLength(3);
		expect(notSelectedApps).toHaveLength(2);
		for (const s of selectedApps) {
			expect(s.rank).toBeGreaterThan(0);
			expect(s.selected_at).toBeTruthy();
		}
	});

	test("process manager is idempotent", async () => {
		await submitAcceptedApplication(env, {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			monthCycle: "2026-03",
		});

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		const drawn = await drawLottery(env, {
			monthCycle: "2026-03",
			applicantPool: [
				{
					applicationId: "app-1",
					applicantId: toApplicantId("07700900001", "Alice"),
				},
			],
			seed: "test-seed",
		});

		await processDrawResults(env, drawn);
		await processDrawResults(env, drawn);

		const { events } =
			await env.eventStore.readStream<ApplicationEvent>("application-app-1");
		expect(events.filter((e) => e.type === "ApplicationSelected")).toHaveLength(
			1,
		);
	});

	test("selected applicant triggers cooldown next month", async () => {
		await submitAcceptedApplication(env, {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			monthCycle: "2026-03",
		});

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		const drawn = await drawLottery(env, {
			monthCycle: "2026-03",
			applicantPool: [
				{
					applicationId: "app-1",
					applicantId: toApplicantId("07700900001", "Alice"),
				},
			],
			seed: "test-seed",
		});

		await processDrawResults(env, drawn);

		await env.eventStore.appendToStream("lottery-2026-04", [
			{
				type: "ApplicationWindowOpened",
				data: { monthCycle: "2026-04", openedAt: "2026-04-01T00:00:00Z" },
			},
		]);

		const result = await checkEligibility(
			toApplicantId("07700900001", "Alice"),
			"2026-04",
			env.pool,
		);
		expect(result).toEqual({ status: "cooldown", lastGrantMonth: "2026-03" });
	});

	test("not_selected projection status", async () => {
		await submitAcceptedApplication(env, {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			monthCycle: "2026-03",
		});

		await env.eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationNotSelected",
				data: {
					applicationId: "app-1",
					applicantId: toApplicantId("07700900001", "Alice"),
					monthCycle: "2026-03",
					notSelectedAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const apps = await queryApplications(env);
		expect(apps[0]!.status).toBe("not_selected");
	});
});
