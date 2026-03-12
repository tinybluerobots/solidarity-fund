import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	acceptCashAlternative,
	approveProofOfAddress,
	assignVolunteer,
	declineCashAlternative,
	recordPayment,
	recordReimbursement,
	rejectProofOfAddress,
} from "../../../src/domain/grant/commandHandlers.ts";
import type { GrantEvent } from "../../../src/domain/grant/types.ts";
import { createTestEnv, type TestEnv } from "../helpers/testEventStore.ts";
import { queryGrant, selectWinner } from "../helpers/workflowSteps.ts";

const bankDetails = {
	sortCode: "12-34-56",
	accountNumber: "12345678",
	proofOfAddressRef: "poa-ref-test",
};

describe("POA rejection workflow", () => {
	let env: TestEnv;

	beforeEach(async () => {
		env = await createTestEnv();
	});

	afterEach(async () => {
		await env.cleanup();
	});

	async function rejectPoaThreeTimes(appId: string) {
		for (let i = 0; i < 3; i++) {
			await rejectProofOfAddress(
				appId,
				"Bad document",
				"vol-1",
				env.eventStore,
			);
		}
	}

	test("3x POA rejection → accept cash → pay → reimburse", async () => {
		const appId = "app-poa-cash";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900022",
			name: "Charlie",
			paymentPreference: "bank",
			bankDetails,
		});

		await rejectPoaThreeTimes(appId);

		// Projection: poa_attempts = 3, still awaiting_review until cash alt offered
		let rows = await queryGrant(env, appId);
		expect(rows[0]!.poa_attempts).toBe(3);

		await acceptCashAlternative(appId, env.eventStore);
		await assignVolunteer(appId, "vol-1", env.eventStore);

		await recordPayment(
			appId,
			{ amount: 40, method: "cash", paidBy: "vol-1" },
			env.eventStore,
		);

		await recordReimbursement(
			appId,
			{
				volunteerId: "vol-1",
				expenseReference: "https://opencollective.com/csf/expenses/789",
			},
			env.eventStore,
		);

		// Event stream: full sequence
		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		const types = events.map((e) => e.type);
		expect(types).toContain("CashAlternativeOffered");
		expect(types).toContain("CashAlternativeAccepted");
		expect(types).toContain("GrantPaid");
		expect(types).toContain("VolunteerReimbursed");
		const paid = events.find((e) => e.type === "GrantPaid");
		expect(paid).toBeDefined();
		expect(paid!.data.method).toBe("cash");

		// Projection: reimbursed
		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("reimbursed");
	});

	test("3x POA rejection → decline cash → slot released", async () => {
		const appId = "app-poa-decline";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900023",
			name: "Diana",
			paymentPreference: "bank",
			bankDetails,
		});

		await rejectPoaThreeTimes(appId);

		await declineCashAlternative(appId, env.eventStore);

		const { events } = await env.eventStore.readStream<GrantEvent>(
			`grant-${appId}`,
		);
		expect(events.find((e) => e.type === "SlotReleased")).toBeDefined();

		// Projection: released
		const rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("released");
		expect(rows[0]!.poa_attempts).toBe(3);
	});

	test("POA rejection stays in awaiting_review and increments poa_attempts", async () => {
		const appId = "app-poa-proj";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900027",
			name: "Eve",
			paymentPreference: "bank",
			bankDetails,
		});

		let rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_review");
		expect(rows[0]!.poa_attempts).toBe(0);

		await rejectProofOfAddress(appId, "Blurry", "vol-1", env.eventStore);

		rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("awaiting_review");
		expect(rows[0]!.poa_attempts).toBe(1);
	});

	test("approve after rejection → poa_approved", async () => {
		const appId = "app-poa-approve-after-reject";
		await selectWinner(env, {
			applicationId: appId,
			phone: "07700900028",
			name: "Frank",
			paymentPreference: "bank",
			bankDetails,
		});

		await rejectProofOfAddress(appId, "Blurry", "vol-1", env.eventStore);
		await approveProofOfAddress(appId, "vol-1", env.eventStore);

		const rows = await queryGrant(env, appId);
		expect(rows[0]!.status).toBe("poa_approved");
		expect(rows[0]!.poa_attempts).toBe(1);
	});
});
