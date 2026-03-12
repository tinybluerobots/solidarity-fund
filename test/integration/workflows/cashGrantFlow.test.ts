import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	assignVolunteer,
	recordPayment,
	recordReimbursement,
	releaseSlot,
} from "../../../src/domain/grant/commandHandlers.ts";
import type { GrantEvent } from "../../../src/domain/grant/types.ts";
import { createTestEnv, type TestEnv } from "../helpers/testEventStore.ts";
import { queryGrant, selectWinner } from "../helpers/workflowSteps.ts";

describe("cash grant workflow", () => {
	let env: TestEnv;

	beforeEach(async () => {
		env = await createTestEnv();
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("full path: cash payment → awaiting_reimbursement → reimburse → complete", async () => {
		const appId = "app-cash-pay";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900021",
			name: "Bob",
			paymentPreference: "cash",
		});

		// Projection: awaiting_cash_handover
		let rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_cash_handover");
		expect(rows[0]!.payment_preference).toBe("cash");

		await assignVolunteer(appId, "vol-1", env.eventStore);
		await recordPayment(
			appId,
			{ amount: 40, method: "cash", paidBy: "vol-1" },
			env.eventStore,
		);

		// Projection: awaiting_reimbursement
		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_reimbursement");
		expect(rows[0]!.amount).toBe(40);
		expect(rows[0]!.payment_method).toBe("cash");

		await recordReimbursement(
			appId,
			{
				volunteerId: "vol-1",
				expenseReference: "https://opencollective.com/csf/expenses/456",
			},
			env.eventStore,
		);

		// Projection: reimbursed
		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("reimbursed");
		expect(rows[0]!.expense_reference).toBe(
			"https://opencollective.com/csf/expenses/456",
		);
		expect(rows[0]!.reimbursed_at).toBeTruthy();

		// Event stream
		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.method).toBe("cash");
		expect(events.find((e) => e.type === "VolunteerReimbursed")).toBeDefined();
	});

	test("volunteer releases unresponsive winner → slot released", async () => {
		const appId = "app-release-cash";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900025",
			name: "Frank",
			paymentPreference: "cash",
		});

		await releaseSlot(
			appId,
			"No response after 14 days",
			"vol-1",
			env.eventStore,
		);

		const rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("released");
		expect(rows[0]!.released_reason).toBe("No response after 14 days");
	});

	test("cash grant created with correct initial status", async () => {
		const appId = "app-cash-init";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900026",
			name: "Grace",
			paymentPreference: "cash",
		});

		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		expect(events[0]!.type).toBe("GrantCreated");
		expect(events[0]!.data.paymentPreference).toBe("cash");
	});
});
