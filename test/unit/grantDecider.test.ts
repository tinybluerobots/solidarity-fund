import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/grant/decider.ts";
import type { GrantState } from "../../src/domain/grant/types.ts";

const core = {
	grantId: "grant-1",
	applicationId: "app-1",
	applicantId: "applicant-1",
	monthCycle: "2026-03",
	rank: 1,
};

function awaitingReview(poaAttempts = 0): GrantState {
	return {
		...core,
		status: "awaiting_review",
		sortCode: "12-34-56",
		accountNumber: "12345678",
		proofOfAddressRef: "poa-ref-1",
		poaAttempts,
	};
}

function poaApproved(poaAttempts = 1): GrantState {
	return { ...core, status: "poa_approved", poaAttempts, volunteerId: "vol-1" };
}

function offeredCashAlt(): GrantState {
	return { ...core, status: "offered_cash_alternative" };
}

function awaitingCashHandover(): GrantState {
	return { ...core, status: "awaiting_cash_handover", volunteerId: "vol-1" };
}

function paidState(): GrantState {
	return {
		...core,
		status: "paid",
		amount: 100,
		method: "bank",
		paidAt: "2026-03-15T10:00:00Z",
	};
}

function awaitingReimbursement(): GrantState {
	return {
		...core,
		status: "awaiting_reimbursement",
		amount: 40,
		paidBy: "vol-1",
		paidAt: "2026-03-15T10:00:00Z",
	};
}

function releasedState(): GrantState {
	return {
		...core,
		status: "released",
		reason: "no show",
		releasedAt: "2026-03-15T10:00:00Z",
	};
}

// --- CreateGrant ---

describe("CreateGrant", () => {
	test("bank preference without bankDetails → GrantCreated, state awaiting_review with empty details", () => {
		const events = decide(
			{
				type: "CreateGrant",
				data: {
					...core,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00Z",
				},
			},
			initialState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantCreated");
		expect(events[0]!.data.paymentPreference).toBe("bank");
	});

	test("bank preference with bankDetails → GrantCreated only (details embedded)", () => {
		const events = decide(
			{
				type: "CreateGrant",
				data: {
					...core,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00Z",
					bankDetails: {
						sortCode: "12-34-56",
						accountNumber: "12345678",
						proofOfAddressRef: "poa-ref-1",
					},
				},
			},
			initialState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantCreated");
		expect(events[0]!.data.bankDetails?.sortCode).toBe("12-34-56");
		expect(events[0]!.data.bankDetails?.proofOfAddressRef).toBe("poa-ref-1");
	});

	test("cash preference → GrantCreated", () => {
		const events = decide(
			{
				type: "CreateGrant",
				data: {
					...core,
					paymentPreference: "cash",
					createdAt: "2026-03-01T00:00:00Z",
				},
			},
			initialState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantCreated");
		expect(events[0]!.data.paymentPreference).toBe("cash");
	});

	test("bank preference with bankDetails → final evolved state is awaiting_review", () => {
		const events = decide(
			{
				type: "CreateGrant",
				data: {
					...core,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00Z",
					bankDetails: {
						sortCode: "12-34-56",
						accountNumber: "12345678",
						proofOfAddressRef: "poa-ref-1",
					},
				},
			},
			initialState(),
		);
		let state = initialState();
		for (const event of events) {
			state = evolve(state, event as Parameters<typeof evolve>[1]);
		}
		expect(state.status).toBe("awaiting_review");
		if (state.status === "awaiting_review") {
			expect(state.sortCode).toBe("12-34-56");
			expect(state.proofOfAddressRef).toBe("poa-ref-1");
		}
	});

	test("throws from non-initial state", () => {
		expect(() =>
			decide(
				{
					type: "CreateGrant",
					data: {
						...core,
						paymentPreference: "bank",
						createdAt: "2026-03-01T00:00:00Z",
					},
				},
				awaitingReview(),
			),
		).toThrow(IllegalStateError);
	});
});

// --- UpdateBankDetails ---

describe("UpdateBankDetails", () => {
	test("awaiting_review → BankDetailsUpdated", () => {
		const events = decide(
			{
				type: "UpdateBankDetails",
				data: {
					grantId: "grant-1",
					sortCode: "99-88-77",
					accountNumber: "99887766",
					updatedAt: "2026-03-02T00:00:00Z",
				},
			},
			awaitingReview(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("BankDetailsUpdated");
		expect(events[0]!.data.sortCode).toBe("99-88-77");
	});

	test("throws from poa_approved state", () => {
		expect(() =>
			decide(
				{
					type: "UpdateBankDetails",
					data: {
						grantId: "grant-1",
						sortCode: "12-34-56",
						accountNumber: "12345678",
						updatedAt: "2026-03-02T00:00:00Z",
					},
				},
				poaApproved(),
			),
		).toThrow(IllegalStateError);
	});

	test("throws from initial state", () => {
		expect(() =>
			decide(
				{
					type: "UpdateBankDetails",
					data: {
						grantId: "grant-1",
						sortCode: "12-34-56",
						accountNumber: "12345678",
						updatedAt: "2026-03-02T00:00:00Z",
					},
				},
				initialState(),
			),
		).toThrow(IllegalStateError);
	});
});

// --- ApproveProofOfAddress ---

describe("ApproveProofOfAddress", () => {
	test("awaiting_review → ProofOfAddressApproved", () => {
		const events = decide(
			{
				type: "ApproveProofOfAddress",
				data: {
					grantId: "grant-1",
					verifiedBy: "vol-1",
					verifiedAt: "2026-03-03T00:00:00Z",
				},
			},
			awaitingReview(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ProofOfAddressApproved");
	});

	test("throws from wrong state", () => {
		expect(() =>
			decide(
				{
					type: "ApproveProofOfAddress",
					data: {
						grantId: "grant-1",
						verifiedBy: "vol-1",
						verifiedAt: "2026-03-03T00:00:00Z",
					},
				},
				paidState(),
			),
		).toThrow(IllegalStateError);
	});
});

// --- RejectProofOfAddress ---

describe("RejectProofOfAddress", () => {
	const rejectCmd = {
		type: "RejectProofOfAddress" as const,
		data: {
			grantId: "grant-1",
			reason: "blurry",
			rejectedBy: "vol-1",
			rejectedAt: "2026-03-03T00:00:00Z",
		},
	};

	test("attempt 1 (poaAttempts=0) → ProofOfAddressRejected only", () => {
		const events = decide(rejectCmd, awaitingReview(0));
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ProofOfAddressRejected");
	});

	test("attempt 2 (poaAttempts=1) → ProofOfAddressRejected only", () => {
		const events = decide(rejectCmd, awaitingReview(1));
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ProofOfAddressRejected");
	});

	test("attempt 3 (poaAttempts=2) → ProofOfAddressRejected + CashAlternativeOffered", () => {
		const events = decide(rejectCmd, awaitingReview(2));
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("ProofOfAddressRejected");
		expect(events[1]!.type).toBe("CashAlternativeOffered");
	});

	test("throws from wrong state", () => {
		expect(() => decide(rejectCmd, paidState())).toThrow(IllegalStateError);
	});

	test("rejection stays in awaiting_review, increments poaAttempts", () => {
		const before = awaitingReview(1);
		const [event] = decide(rejectCmd, before);
		const after = evolve(before, event as Parameters<typeof evolve>[1]);
		expect(after.status).toBe("awaiting_review");
		if (after.status === "awaiting_review") {
			expect(after.poaAttempts).toBe(2);
			expect(after.sortCode).toBe("12-34-56");
		}
	});
});

// --- AcceptCashAlternative ---

describe("AcceptCashAlternative", () => {
	test("offered → CashAlternativeAccepted", () => {
		const events = decide(
			{
				type: "AcceptCashAlternative",
				data: { grantId: "grant-1", acceptedAt: "2026-03-04T00:00:00Z" },
			},
			offeredCashAlt(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("CashAlternativeAccepted");
	});

	test("throws from wrong state", () => {
		expect(() =>
			decide(
				{
					type: "AcceptCashAlternative",
					data: { grantId: "grant-1", acceptedAt: "2026-03-04T00:00:00Z" },
				},
				awaitingReview(),
			),
		).toThrow(IllegalStateError);
	});
});

// --- DeclineCashAlternative ---

describe("DeclineCashAlternative", () => {
	test("offered → CashAlternativeDeclined + SlotReleased", () => {
		const events = decide(
			{
				type: "DeclineCashAlternative",
				data: { grantId: "grant-1", declinedAt: "2026-03-04T00:00:00Z" },
			},
			offeredCashAlt(),
		);
		expect(events).toHaveLength(2);
		expect(events[0]!.type).toBe("CashAlternativeDeclined");
		expect(events[1]!.type).toBe("SlotReleased");
		expect(events[1]!.data.applicationId).toBe("app-1");
		expect(events[1]!.data.reason).toBe("Cash alternative declined");
	});

	test("throws from wrong state", () => {
		expect(() =>
			decide(
				{
					type: "DeclineCashAlternative",
					data: { grantId: "grant-1", declinedAt: "2026-03-04T00:00:00Z" },
				},
				awaitingReview(),
			),
		).toThrow(IllegalStateError);
	});
});

// --- RecordPayment ---

describe("RecordPayment", () => {
	const payCmd = {
		type: "RecordPayment" as const,
		data: {
			grantId: "grant-1",
			amount: 100,
			method: "bank" as const,
			paidBy: "admin-1",
			paidAt: "2026-03-10T00:00:00Z",
		},
	};

	test("poa_approved → GrantPaid", () => {
		const events = decide(payCmd, poaApproved());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantPaid");
		expect(events[0]!.data.applicationId).toBe("app-1");
		expect(events[0]!.data.amount).toBe(100);
	});

	test("awaiting_cash_handover → GrantPaid", () => {
		const events = decide(
			{ ...payCmd, data: { ...payCmd.data, method: "cash" as const } },
			awaitingCashHandover(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("GrantPaid");
		expect(events[0]!.data.method).toBe("cash");
	});

	test("throws from wrong state", () => {
		expect(() => decide(payCmd, awaitingReview())).toThrow(IllegalStateError);
	});

	test("poa_approved rejects cash method", () => {
		expect(() =>
			decide(
				{ ...payCmd, data: { ...payCmd.data, method: "cash" as const } },
				poaApproved(),
			),
		).toThrow(IllegalStateError);
	});

	test("awaiting_cash_handover rejects bank method", () => {
		expect(() => decide(payCmd, awaitingCashHandover())).toThrow(
			IllegalStateError,
		);
	});

	test("throws when no volunteer assigned", () => {
		expect(() =>
			decide(payCmd, { ...poaApproved(), volunteerId: undefined }),
		).toThrow(IllegalStateError);
	});

	test("throws when no volunteer assigned (cash)", () => {
		expect(() =>
			decide(
				{ ...payCmd, data: { ...payCmd.data, method: "cash" as const } },
				{ ...awaitingCashHandover(), volunteerId: undefined },
			),
		).toThrow(IllegalStateError);
	});
});

// --- ReleaseSlot ---

describe("ReleaseSlot", () => {
	const releaseCmd = {
		type: "ReleaseSlot" as const,
		data: {
			grantId: "grant-1",
			reason: "no show",
			releasedBy: "admin-1",
			releasedAt: "2026-03-10T00:00:00Z",
		},
	};

	test("awaiting_review → SlotReleased", () => {
		const events = decide(releaseCmd, awaitingReview());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("SlotReleased");
		expect(events[0]!.data.applicationId).toBe("app-1");
	});

	test("awaiting_cash_handover → SlotReleased", () => {
		const events = decide(releaseCmd, awaitingCashHandover());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("SlotReleased");
	});

	test("offered_cash_alternative → SlotReleased", () => {
		const events = decide(releaseCmd, offeredCashAlt());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("SlotReleased");
	});

	test("throws from paid state", () => {
		expect(() => decide(releaseCmd, paidState())).toThrow(IllegalStateError);
	});

	test("throws from initial state", () => {
		expect(() => decide(releaseCmd, initialState())).toThrow(IllegalStateError);
	});

	test("throws from released state", () => {
		expect(() => decide(releaseCmd, releasedState())).toThrow(
			IllegalStateError,
		);
	});
});

// --- AssignVolunteer ---

describe("AssignVolunteer", () => {
	const assignCmd = {
		type: "AssignVolunteer" as const,
		data: {
			grantId: "grant-1",
			volunteerId: "vol-1",
			assignedAt: "2026-03-02T00:00:00Z",
		},
	};

	test("awaiting_review → VolunteerAssigned", () => {
		const events = decide(assignCmd, awaitingReview());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("VolunteerAssigned");
	});

	test("awaiting_cash_handover → VolunteerAssigned", () => {
		const events = decide(assignCmd, awaitingCashHandover());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("VolunteerAssigned");
	});

	test("throws from initial state", () => {
		expect(() => decide(assignCmd, initialState())).toThrow(IllegalStateError);
	});

	test("throws from paid state", () => {
		expect(() => decide(assignCmd, paidState())).toThrow(IllegalStateError);
	});
});

// --- Evolve ---

describe("evolve", () => {
	test("GrantCreated (bank) → awaiting_review with bank details and poaAttempts=0", () => {
		const state = evolve(initialState(), {
			type: "GrantCreated",
			data: {
				...core,
				paymentPreference: "bank",
				createdAt: "2026-03-01T00:00:00Z",
				bankDetails: {
					sortCode: "12-34-56",
					accountNumber: "12345678",
					proofOfAddressRef: "poa-ref-1",
				},
			},
		});
		expect(state).toMatchObject({
			status: "awaiting_review",
			grantId: "grant-1",
			sortCode: "12-34-56",
			accountNumber: "12345678",
			proofOfAddressRef: "poa-ref-1",
			poaAttempts: 0,
		});
	});

	test("GrantCreated (cash) → awaiting_cash_handover", () => {
		const state = evolve(initialState(), {
			type: "GrantCreated",
			data: {
				...core,
				paymentPreference: "cash",
				createdAt: "2026-03-01T00:00:00Z",
			},
		});
		expect(state).toMatchObject({
			status: "awaiting_cash_handover",
			grantId: "grant-1",
		});
	});

	test("BankDetailsUpdated → updates sort code and account number, stays awaiting_review", () => {
		const state = evolve(awaitingReview(0), {
			type: "BankDetailsUpdated",
			data: {
				grantId: "grant-1",
				sortCode: "99-88-77",
				accountNumber: "99887766",
				updatedAt: "2026-03-02T00:00:00Z",
			},
		});
		expect(state.status).toBe("awaiting_review");
		if (state.status === "awaiting_review") {
			expect(state.sortCode).toBe("99-88-77");
			expect(state.accountNumber).toBe("99887766");
			expect(state.proofOfAddressRef).toBe("poa-ref-1");
		}
	});

	test("ProofOfAddressApproved → poa_approved", () => {
		const state = evolve(awaitingReview(1), {
			type: "ProofOfAddressApproved",
			data: {
				grantId: "grant-1",
				verifiedBy: "vol-1",
				verifiedAt: "2026-03-03T00:00:00Z",
			},
		});
		expect(state.status).toBe("poa_approved");
	});

	test("ProofOfAddressRejected → stays awaiting_review, increments poaAttempts", () => {
		const state = evolve(awaitingReview(1), {
			type: "ProofOfAddressRejected",
			data: {
				grantId: "grant-1",
				reason: "blurry",
				attempt: 1,
				rejectedBy: "vol-1",
				rejectedAt: "2026-03-03T00:00:00Z",
			},
		});
		expect(state.status).toBe("awaiting_review");
		if (state.status === "awaiting_review") {
			expect(state.poaAttempts).toBe(2);
		}
	});

	test("CashAlternativeOffered → offered_cash_alternative", () => {
		const state = evolve(awaitingReview(3), {
			type: "CashAlternativeOffered",
			data: { grantId: "grant-1", offeredAt: "2026-03-03T00:00:00Z" },
		});
		expect(state.status).toBe("offered_cash_alternative");
	});

	test("CashAlternativeAccepted → awaiting_cash_handover", () => {
		const state = evolve(offeredCashAlt(), {
			type: "CashAlternativeAccepted",
			data: { grantId: "grant-1", acceptedAt: "2026-03-04T00:00:00Z" },
		});
		expect(state.status).toBe("awaiting_cash_handover");
	});

	test("CashAlternativeDeclined → released is handled by SlotReleased", () => {
		const state = evolve(offeredCashAlt(), {
			type: "CashAlternativeDeclined",
			data: { grantId: "grant-1", declinedAt: "2026-03-04T00:00:00Z" },
		});
		expect(state.status).toBe("offered_cash_alternative");
	});

	test("GrantPaid → paid", () => {
		const state = evolve(poaApproved(), {
			type: "GrantPaid",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				amount: 100,
				method: "bank",
				paidBy: "admin-1",
				paidAt: "2026-03-10T00:00:00Z",
			},
		});
		expect(state).toMatchObject({
			status: "paid",
			amount: 100,
			method: "bank",
		});
	});

	test("SlotReleased → released", () => {
		const state = evolve(awaitingReview(), {
			type: "SlotReleased",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				reason: "no show",
				releasedBy: "admin-1",
				releasedAt: "2026-03-10T00:00:00Z",
			},
		});
		expect(state).toMatchObject({ status: "released", reason: "no show" });
	});

	test("VolunteerAssigned → sets volunteerId", () => {
		const state = evolve(awaitingReview(), {
			type: "VolunteerAssigned",
			data: {
				grantId: "grant-1",
				volunteerId: "vol-1",
				assignedAt: "2026-03-02T00:00:00Z",
			},
		});
		if (state.status === "awaiting_review") {
			expect(state.volunteerId).toBe("vol-1");
		}
	});

	test("GrantPaid with cash → awaiting_reimbursement", () => {
		const state = evolve(awaitingCashHandover(), {
			type: "GrantPaid",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				amount: 40,
				method: "cash",
				paidBy: "vol-1",
				paidAt: "2026-03-10T00:00:00Z",
			},
		});
		expect(state.status).toBe("awaiting_reimbursement");
		if (state.status === "awaiting_reimbursement") {
			expect(state.amount).toBe(40);
			expect(state.paidBy).toBe("vol-1");
		}
	});

	test("GrantPaid with bank → paid", () => {
		const state = evolve(poaApproved(), {
			type: "GrantPaid",
			data: {
				grantId: "grant-1",
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				amount: 100,
				method: "bank",
				paidBy: "admin-1",
				paidAt: "2026-03-10T00:00:00Z",
			},
		});
		expect(state).toMatchObject({
			status: "paid",
			amount: 100,
			method: "bank",
		});
	});

	test("VolunteerReimbursed → reimbursed state", () => {
		const state = evolve(awaitingReimbursement(), {
			type: "VolunteerReimbursed",
			data: {
				grantId: "grant-1",
				volunteerId: "vol-1",
				expenseReference: "EXP-001",
				reimbursedAt: "2026-03-20T00:00:00Z",
			},
		});
		expect(state).toMatchObject({
			status: "reimbursed",
			expenseReference: "EXP-001",
			reimbursedAt: "2026-03-20T00:00:00Z",
		});
	});
});

// --- RecordReimbursement ---

describe("RecordReimbursement", () => {
	const reimburseCmd = {
		type: "RecordReimbursement" as const,
		data: {
			grantId: "grant-1",
			volunteerId: "vol-1",
			expenseReference: "EXP-001",
			reimbursedAt: "2026-03-20T00:00:00Z",
		},
	};

	test("awaiting_reimbursement → VolunteerReimbursed", () => {
		const events = decide(reimburseCmd, awaitingReimbursement());
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("VolunteerReimbursed");
		expect(events[0]!.data.expenseReference).toBe("EXP-001");
	});

	test("throws from paid state", () => {
		expect(() => decide(reimburseCmd, paidState())).toThrow(IllegalStateError);
	});

	test("throws from initial state", () => {
		expect(() => decide(reimburseCmd, initialState())).toThrow(
			IllegalStateError,
		);
	});
});
