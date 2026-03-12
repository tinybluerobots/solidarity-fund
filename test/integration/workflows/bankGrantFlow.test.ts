import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	approveProofOfAddress,
	assignVolunteer,
	recordPayment,
	recordReimbursement,
	releaseSlot,
	updateBankDetails,
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

	test("full path: assign → approve POA → pay", async () => {
		const appId = "app-bank-pay";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900020",
			name: "Alice",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-1",
			},
		});

		// Projection: awaiting_review with bank details stored
		let rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_review");
		expect(rows[0]!.payment_preference).toBe("bank");
		expect(rows[0]!.poa_attempts).toBe(0);
		expect(rows[0]!.sort_code).toBe("12-34-56");
		expect(rows[0]!.account_number).toBe("12345678");

		await assignVolunteer(appId, "vol-1", env.eventStore);
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

	test("volunteer edits bank details before approving POA", async () => {
		const appId = "app-bank-edit";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900050",
			name: "EditTest",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "11-22-33",
				accountNumber: "11223344",
				proofOfAddressRef: "poa-ref-edit",
			},
		});

		// Volunteer corrects a typo in the sort code
		await updateBankDetails(
			appId,
			{ sortCode: "12-34-56", accountNumber: "12345678" },
			env.eventStore,
		);

		const rows = await queryGrant(env, appId);
		expect(rows[0]!.sort_code).toBe("12-34-56");
		expect(rows[0]!.account_number).toBe("12345678");
		expect(rows[0]!.status).toBe("awaiting_review");
	});

	test("POA rejection stays in awaiting_review, increments poa_attempts", async () => {
		const appId = "app-poa-reject";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900051",
			name: "PoaReject",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-reject",
			},
		});

		await approveProofOfAddress(
			appId,
			"vol-1",
			env.eventStore,
		).catch(() => {}); // approve first to confirm state, then reject

		// Actually test rejection flow properly
		const appId2 = "app-poa-reject-2";
		await selectWinner(env, {
			applicationId: appId2,
			phone: "07700900052",
			name: "PoaReject2",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-reject-2",
			},
		});

		// Reject once
		await (
			await import("../../../src/domain/grant/commandHandlers.ts")
		).rejectProofOfAddress(appId2, "blurry image", "vol-1", env.eventStore);

		const rows = await queryGrant(env, appId2);
		expect(rows[0]!.status).toBe("awaiting_review");
		expect(rows[0]!.poa_attempts).toBe(1);
	});

	test("bank grant has no reimbursement step", async () => {
		const appId = "app-bank-no-reimburse";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900031",
			name: "Grace",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-grace",
			},
		});

		await approveProofOfAddress(appId, "vol-1", env.eventStore);
		await assignVolunteer(appId, "vol-1", env.eventStore);
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

	test("bank details provided at apply time → grant created at awaiting_review, volunteer approves", async () => {
		const appId = "app-fast-path";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900099",
			name: "FastPath",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-fast",
			},
		});

		// Always requires volunteer review
		const rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_review");
		expect(rows[0]!.sort_code).toBe("12-34-56");
		expect(rows[0]!.account_number).toBe("12345678");

		// Volunteer approves POA
		await approveProofOfAddress(appId, "vol-1", env.eventStore);
		const approvedRows = await queryGrant(env, appId);
		expect(approvedRows[0]!.status).toBe("poa_approved");

		// Verify POA approved by volunteer, not auto-approved by system
		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const types = events.map((e) => e.type);
		expect(types).toContain("GrantCreated");
		expect(types).not.toContain("BankDetailsUpdated");
		expect(types).toContain("ProofOfAddressApproved");
		const poa = events.find((e) => e.type === "ProofOfAddressApproved");
		expect(poa!.data.verifiedBy).toBe("vol-1");
	});

	test("process manager idempotency — grant not duplicated", async () => {
		const appId = "app-idem";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900032",
			name: "Charlie",
			paymentPreference: "bank",
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-idem",
			},
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
			bankDetails: {
				sortCode: "12-34-56",
				accountNumber: "12345678",
				proofOfAddressRef: "poa-ref-eve",
			},
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
