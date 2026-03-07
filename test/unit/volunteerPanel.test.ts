import { describe, expect, test } from "bun:test";
import type { Volunteer } from "../../src/domain/volunteer/types";
import { createPanel, editPanel } from "../../src/web/pages/volunteerPanel";

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
	isAdmin: false,
	isDisabled: false,
	requiresPasswordReset: false,
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

const disabledVol: Volunteer = {
	...bob,
	isDisabled: true,
};

describe("editPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("data-bind-name");
		expect(html).toContain("data-bind-phone");
		expect(html).toContain("data-bind-email");
	});

	test("pre-fills signal values", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("Alice Smith");
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
	});

	test("has password field with hint", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("data-bind-password");
		expect(html).toContain("Leave blank to keep current");
	});

	test("has Save button", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("Save");
	});

	test("uses @put for existing volunteer", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("@put");
		expect(html).toContain("/volunteers/v-1");
	});

	test("shows admin checkbox on edit", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("data-bind-is-admin");
	});

	test("shows disable button for other volunteers", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain(">Disable<");
		expect(html).toContain("confirmDisable");
	});

	test("hides disable button for self", () => {
		const html = editPanel(alice, "v-1");
		expect(html).not.toContain(">Disable<");
		expect(html).not.toContain(">Enable<");
	});

	test("shows enable button for disabled volunteers", () => {
		const html = editPanel(disabledVol, "v-other");
		expect(html).toContain(">Enable<");
		expect(html).not.toContain(">Disable<");
	});

	test("renders Details and History tabs", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("Details");
		expect(html).toContain("History");
	});

	test("defaults to Details tab active", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("activeTab: 'details'");
	});

	test("History tab triggers lazy load", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain(`/volunteers/${alice.id}/history`);
	});
});

describe("createPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-name");
		expect(html).toContain("data-bind-phone");
	});

	test("has password field with required attribute", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-password");
		expect(html).toContain("required");
	});

	test("has Create button", () => {
		const html = createPanel();
		expect(html).toContain("Create");
	});

	test("uses @post for new volunteer", () => {
		const html = createPanel();
		expect(html).toContain("@post");
		expect(html).toContain("/volunteers");
	});

	test("has admin checkbox", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-is-admin");
	});

	test("phone input has numeric pattern", () => {
		const html = createPanel();
		expect(html).toContain('pattern="[0-9]*"');
		expect(html).toContain('inputmode="numeric"');
	});
});
