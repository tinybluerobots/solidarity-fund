import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	approveProofOfAddress,
	assignVolunteer,
	recordPayment,
	recordReimbursement,
	releaseSlot,
	submitBankDetails,
} from "../../../src/domain/grant/commandHandlers.ts";
import type { GrantEvent } from "../../../src/domain/grant/types.ts";
import { createTestEnv, type TestEnv } from "../helpers/testEventStore.ts";
import { queryGrant, selectWinner } from "../helpers/workflowSteps.ts";

describe("bank grant workflow", () => {
	let env: TestEnv;

	beforeEach(async () => {
		env = await createTestEnv();
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("full path: assign → submit bank details → approve POA → pay", async () => {
		const appId = "app-bank-pay";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900020",
			name: "Alice",
			paymentPreference: "bank",
		});

		// Projection: awaiting_bank_details
		let rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_bank_details");
		expect(rows[0]!.payment_preference).toBe("bank");
		expect(rows[0]!.poa_attempts).toBe(0);

		await assignVolunteer(appId, "vol-1", env.eventStore);
		await submitBankDetails(
			appId,
			{
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-1",
			},
			env.eventStore,
		);

		// Projection: bank_details_submitted
		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("bank_details_submitted");
		expect(rows[0]!.poa_attempts).toBe(1);

		await approveProofOfAddress(appId, "vol-1", env.eventStore);

		// Projection: poa_approved
		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("poa_approved");

		await recordPayment(
			appId,
			{ amount: 40, method: "bank", paidBy: "vol-1" },
			env.eventStore,
		);

		// Projection: paid
		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("paid");
		expect(rows[0]!.amount).toBe(40);
		expect(rows[0]!.payment_method).toBe("bank");
		expect(rows[0]!.paid_at).toBeTruthy();

		// Event stream verification
		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.method).toBe("bank");
		expect(paid!.data.amount).toBe(40);
	});

	test("bank grant has no reimbursement step", async () => {
		const appId = "app-bank-no-reimburse";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900031",
			name: "Grace",
			paymentPreference: "bank",
		});

		await submitBankDetails(
			appId,
			{
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-1",
			},
			env.eventStore,
		);
		await approveProofOfAddress(appId, "vol-1", env.eventStore);
		await recordPayment(
			appId,
			{ amount: 40, method: "bank", paidBy: "vol-1" },
			env.eventStore,
		);

		await expect(
			recordReimbursement(
				appId,
				{ volunteerId: "vol-1", expenseReference: "ref-1" },
				env.eventStore,
			),
		).rejects.toThrow(/cannot record reimbursement/i);
	});

	test("process manager idempotency — grant not duplicated", async () => {
		const appId = "app-idem";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900032",
			name: "Charlie",
			paymentPreference: "bank",
		});

		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		expect(events.filter((e) => e.type === "GrantCreated")).toHaveLength(1);
	});

	test("volunteer releases unresponsive winner", async () => {
		const appId = "app-release";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900024",
			name: "Eve",
			paymentPreference: "bank",
		});

		await releaseSlot(
			appId,
			"No response after 14 days",
			"vol-1",
			env.eventStore,
		);

		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const released = events.find((e) => e.type === "SlotReleased");
		expect(released).toBeDefined();
		expect(released!.data.reason).toBe("No response after 14 days");
		expect(released!.data.releasedBy).toBe("vol-1");

		// Projection: released
		const rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("released");
		expect(rows[0]!.released_reason).toBe("No response after 14 days");
	});
});
