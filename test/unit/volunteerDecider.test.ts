import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/volunteer/decider.ts";
import type {
	VolunteerCommand,
	VolunteerEvent,
	VolunteerState,
} from "../../src/domain/volunteer/types.ts";

const createCommand: VolunteerCommand = {
	type: "CreateVolunteer",
	data: {
		id: "v-1",
		name: "Alice",
		phone: "07700900001",
		email: "alice@example.com",
		passwordHash: "$argon2id$hashed",
		createdAt: "2026-01-01T00:00:00.000Z",
	},
};

const activeState: VolunteerState = {
	status: "active",
	id: "v-1",
	name: "Alice",
	phone: "07700900001",
	email: "alice@example.com",
	passwordHash: "$argon2id$hashed",
	isAdmin: false,
	requiresPasswordReset: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const disabledState: VolunteerState = {
	...activeState,
	status: "disabled",
};

describe("volunteer decider", () => {
	describe("decide", () => {
		test("CreateVolunteer emits VolunteerCreated from initial state", () => {
			const events = decide(createCommand, initialState());
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerCreated");
			expect(events[0]!.data.name).toBe("Alice");
		});

		test("CreateVolunteer rejects if already exists", () => {
			expect(() => decide(createCommand, activeState)).toThrow(
				IllegalStateError,
			);
		});

		test("UpdateVolunteer emits VolunteerUpdated from active state", () => {
			const cmd: VolunteerCommand = {
				type: "UpdateVolunteer",
				data: {
					id: "v-1",
					name: "Alicia",
					phone: "07700900001",
					email: "alice@example.com",
					passwordHash: "$argon2id$hashed",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerUpdated");
			expect(events[0]!.data.name).toBe("Alicia");
		});

		test("UpdateVolunteer rejects from initial state", () => {
			const cmd: VolunteerCommand = {
				type: "UpdateVolunteer",
				data: {
					id: "v-1",
					name: "Alicia",
					passwordHash: "$argon2id$hashed",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DisableVolunteer emits VolunteerDisabled from active state", () => {
			const cmd: VolunteerCommand = {
				type: "DisableVolunteer",
				data: { id: "v-1", disabledAt: "2026-01-03T00:00:00.000Z" },
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerDisabled");
		});

		test("DisableVolunteer rejects from initial state", () => {
			const cmd: VolunteerCommand = {
				type: "DisableVolunteer",
				data: { id: "v-1", disabledAt: "2026-01-03T00:00:00.000Z" },
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});

		test("DisableVolunteer rejects from disabled state", () => {
			const cmd: VolunteerCommand = {
				type: "DisableVolunteer",
				data: { id: "v-1", disabledAt: "2026-01-03T00:00:00.000Z" },
			};
			expect(() => decide(cmd, disabledState)).toThrow(IllegalStateError);
		});

		test("EnableVolunteer emits VolunteerEnabled from disabled state", () => {
			const cmd: VolunteerCommand = {
				type: "EnableVolunteer",
				data: { id: "v-1", enabledAt: "2026-01-04T00:00:00.000Z" },
			};
			const events = decide(cmd, disabledState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("VolunteerEnabled");
		});

		test("EnableVolunteer rejects from active state", () => {
			const cmd: VolunteerCommand = {
				type: "EnableVolunteer",
				data: { id: "v-1", enabledAt: "2026-01-04T00:00:00.000Z" },
			};
			expect(() => decide(cmd, activeState)).toThrow(IllegalStateError);
		});

		test("ChangePassword emits PasswordChanged from active state", () => {
			const cmd: VolunteerCommand = {
				type: "ChangePassword",
				data: {
					id: "v-1",
					passwordHash: "$argon2id$newpassword",
					changedAt: "2026-01-04T00:00:00.000Z",
				},
			};
			const events = decide(cmd, activeState);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("PasswordChanged");
			expect(events[0]!.data.passwordHash).toBe("$argon2id$newpassword");
		});

		test("ChangePassword rejects from initial state", () => {
			const cmd: VolunteerCommand = {
				type: "ChangePassword",
				data: {
					id: "v-1",
					passwordHash: "$argon2id$newpassword",
					changedAt: "2026-01-04T00:00:00.000Z",
				},
			};
			expect(() => decide(cmd, initialState())).toThrow(IllegalStateError);
		});
	});

	describe("evolve", () => {
		test("VolunteerCreated transitions to active", () => {
			const event: VolunteerEvent = {
				type: "VolunteerCreated",
				data: createCommand.data,
			};
			const state = evolve(initialState(), event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alice");
				expect(state.phone).toBe("07700900001");
				expect(state.passwordHash).toBe("$argon2id$hashed");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
			}
		});

		test("VolunteerUpdated updates active state", () => {
			const event: VolunteerEvent = {
				type: "VolunteerUpdated",
				data: {
					id: "v-1",
					name: "Alicia",
					passwordHash: "$argon2id$newhash",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alicia");
				expect(state.passwordHash).toBe("$argon2id$newhash");
				expect(state.createdAt).toBe("2026-01-01T00:00:00.000Z");
				expect(state.updatedAt).toBe("2026-01-02T00:00:00.000Z");
			}
		});

		test("VolunteerCreated with isAdmin and requiresPasswordReset evolves correctly", () => {
			const event: VolunteerEvent = {
				type: "VolunteerCreated",
				data: {
					...createCommand.data,
					isAdmin: true,
					requiresPasswordReset: true,
				},
			};
			const state = evolve(initialState(), event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.isAdmin).toBe(true);
				expect(state.requiresPasswordReset).toBe(true);
			}
		});

		test("VolunteerCreated defaults isAdmin=false and requiresPasswordReset=false", () => {
			const event: VolunteerEvent = {
				type: "VolunteerCreated",
				data: createCommand.data,
			};
			const state = evolve(initialState(), event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.isAdmin).toBe(false);
				expect(state.requiresPasswordReset).toBe(false);
			}
		});

		test("PasswordChanged clears requiresPasswordReset", () => {
			const stateWithReset: VolunteerState = {
				...activeState,
				status: "active",
				requiresPasswordReset: true,
			};
			const event: VolunteerEvent = {
				type: "PasswordChanged",
				data: {
					id: "v-1",
					passwordHash: "$argon2id$newpassword",
					changedAt: "2026-01-04T00:00:00.000Z",
				},
			};
			const state = evolve(stateWithReset, event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.passwordHash).toBe("$argon2id$newpassword");
				expect(state.requiresPasswordReset).toBe(false);
				expect(state.updatedAt).toBe("2026-01-04T00:00:00.000Z");
			}
		});

		test("VolunteerDisabled transitions to disabled", () => {
			const event: VolunteerEvent = {
				type: "VolunteerDisabled",
				data: { id: "v-1", disabledAt: "2026-01-03T00:00:00.000Z" },
			};
			const state = evolve(activeState, event);
			expect(state.status).toBe("disabled");
			if (state.status === "disabled") {
				expect(state.name).toBe("Alice");
				expect(state.updatedAt).toBe("2026-01-03T00:00:00.000Z");
			}
		});

		test("VolunteerEnabled transitions to active", () => {
			const event: VolunteerEvent = {
				type: "VolunteerEnabled",
				data: { id: "v-1", enabledAt: "2026-01-04T00:00:00.000Z" },
			};
			const state = evolve(disabledState, event);
			expect(state.status).toBe("active");
			if (state.status === "active") {
				expect(state.name).toBe("Alice");
				expect(state.updatedAt).toBe("2026-01-04T00:00:00.000Z");
			}
		});
	});
});
