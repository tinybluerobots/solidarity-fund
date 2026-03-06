import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/recipient/decider.ts";
import type {
	RecipientCommand,
	RecipientEvent,
	RecipientState,
} from "../../src/domain/recipient/types.ts";

const createCommand: RecipientCommand = {
	type: "CreateRecipient",
	data: {
		id: "r-1",
		phone: "07700900001",
		name: "Alice",
		paymentPreference: "cash",
		createdAt: "2026-01-01T00:00:00.000Z",
	},
};

const activeState: RecipientState = {
	status: "active",
	id: "r-1",
	phone: "07700900001",
	name: "Alice",
	paymentPreference: "cash",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("recipient decider", () => {
	describe("decide", () => {
		test("CreateRecipient emits RecipientCreated from initial state", () => {
			const events = decide(createCommand, initialState());
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("RecipientCreated");
			expect(events[0]!.data.phone).toBe("07700900001");
		});

		test("CreateRecipient rejects if already exists", () => {
			expect(() => decide(createCommand, activeState)).toThrow(
				IllegalStateError,
			);
		});

		test("UpdateRecipient emits RecipientUpdated from active state", () => {
			const cmd: RecipientCommand = {
				type: "UpdateRecipient",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					phone: "07700900001",
					name: "Alicia",
					paymentPreference: "bank",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("RecipientUpdated");
			expect(events[0]!.data.name).toBe("Alicia");
		});

		test("UpdateRecipient rejects from initial state", () => {
			const cmd: RecipientCommand = {
				type: "UpdateRecipient",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					phone: "07700900001",
					name: "Alicia",
					paymentPreference: "cash",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DeleteRecipient emits RecipientDeleted from active state", () => {
			const cmd: RecipientCommand = {
				type: "DeleteRecipient",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("RecipientDeleted");
		});

		test("DeleteRecipient rejects from initial state", () => {
			const cmd: RecipientCommand = {
				type: "DeleteRecipient",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DeleteRecipient rejects from deleted state", () => {
			const cmd: RecipientCommand = {
				type: "DeleteRecipient",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, { status: "deleted" })).toThrow(
				IllegalStateError,
			);
		});
	});

	describe("evolve", () => {
		test("RecipientCreated transitions to active", () => {
			const event: RecipientEvent = {
				type: "RecipientCreated",
				data: createCommand.data,
			};
			const state = evolve(initialState(), event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.phone).toBe("07700900001");
				expect(state.name).toBe("Alice");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
			}
		});

		test("RecipientUpdated updates active state", () => {
			const event: RecipientEvent = {
				type: "RecipientUpdated",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					phone: "07700900001",
					name: "Alicia",
					paymentPreference: "bank",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alicia");
				expect(state.paymentPreference).toBe("bank");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-02T00:00:00.000Z");
			}
		});

		test("RecipientDeleted transitions to deleted", () => {
			const event: RecipientEvent = {
				type: "RecipientDeleted",
				data: {
					id: "r-1",
					volunteerId: "v-1",
					deletedAt: "2026-01-03T00:00:00.000Z",
				},
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("deleted");
		});
	});
});
