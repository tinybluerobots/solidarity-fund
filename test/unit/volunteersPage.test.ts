import { describe, expect, test } from "bun:test";
import type { Volunteer } from "../../src/domain/volunteer/types";
import { volunteersPage } from "../../src/web/pages/volunteers";

const alice: Volunteer = {
	id: "v-1",
	name: "Alice Smith",
	phone: "07700900001",
	email: "alice@example.com",
	isAdmin: true,
	isDisabled: false,
	requiresPasswordReset: false,
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Volunteer = {
	id: "v-2",
	name: "Bob Jones",
	phone: "07700900002",
	isAdmin: false,
	isDisabled: false,
	requiresPasswordReset: false,
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("volunteersPage", () => {
	test("renders table with volunteers", () => {
		const html = volunteersPage([alice, bob]);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("Bob Jones");
		expect(html).toContain("07700900001");
		expect(html).toContain("07700900002");
	});

	test("renders empty state when no volunteers", () => {
		const html = volunteersPage([]);
		expect(html).toContain("No volunteers yet");
	});

	test("renders admin badge", () => {
		const html = volunteersPage([alice, bob]);
		expect(html).toContain("Admin");
	});

	test("includes Datastar signals for search", () => {
		const html = volunteersPage([alice]);
		expect(html).toContain("data-signals");
		expect(html).toContain("search");
	});

	test("includes search input with data-bind", () => {
		const html = volunteersPage([alice]);
		expect(html).toContain("data-bind-search");
	});

	test("includes Add Volunteer button", () => {
		const html = volunteersPage([]);
		expect(html).toContain("Add Volunteer");
	});

	test("table rows have data-on-click for SSE fetch", () => {
		const html = volunteersPage([alice]);
		expect(html).toContain("@get");
		expect(html).toContain("/volunteers/v-1/edit");
	});
});
