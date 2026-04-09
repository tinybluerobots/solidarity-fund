import { describe, expect, test } from "bun:test";
import type { Volunteer } from "../../src/domain/volunteer/types.ts";
import { requirePasswordChange } from "../../src/web/server.ts";

function makeVolunteer(overrides: Partial<Volunteer> = {}): Volunteer {
	return {
		id: "v1",
		name: "Test",
		isAdmin: false,
		isDisabled: false,
		requiresPasswordReset: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("requirePasswordChange", () => {
	test("returns redirect when requiresPasswordReset is true", () => {
		const volunteer = makeVolunteer({ requiresPasswordReset: true });
		const result = requirePasswordChange(volunteer);
		expect(result).not.toBeNull();
		expect(result!.status).toBe(302);
		expect(result!.headers.get("location")).toBe("/change-password");
	});

	test("returns null when requiresPasswordReset is false", () => {
		const volunteer = makeVolunteer({ requiresPasswordReset: false });
		const result = requirePasswordChange(volunteer);
		expect(result).toBeNull();
	});
});
