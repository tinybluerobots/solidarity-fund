import { describe, expect, test } from "bun:test";
import type { Volunteer } from "../../src/domain/volunteer/types";
import {
	createPanel,
	editPanel,
	viewPanel,
} from "../../src/web/pages/volunteerPanel";

const alice: Volunteer = {
	id: "v-1",
	name: "Alice Smith",
	phone: "07700900001",
	email: "alice@example.com",
	isAdmin: true,
	requiresPasswordReset: false,
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

const bob: Volunteer = {
	id: "v-2",
	name: "Bob Jones",
	isAdmin: false,
	requiresPasswordReset: false,
	createdAt: "2026-03-02T00:00:00.000Z",
	updatedAt: "2026-03-02T00:00:00.000Z",
};

describe("viewPanel", () => {
	test("shows volunteer name as heading", () => {
		const html = viewPanel(alice, "v-other");
		expect(html).toContain("Alice Smith");
	});

	test("shows all fields for volunteer with details", () => {
		const html = viewPanel(alice, "v-other");
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
		expect(html).toContain("Admin");
	});

	test("has Edit and Delete buttons when not self", () => {
		const html = viewPanel(alice, "v-other");
		expect(html).toContain("Edit");
		expect(html).toContain("Delete");
	});

	test("has close button", () => {
		const html = viewPanel(alice, "v-other");
		expect(html).toContain("Close");
	});

	test("hides delete button for self", () => {
		const html = viewPanel(alice, "v-1");
		expect(html).toContain("Edit");
		expect(html).not.toContain("Delete");
	});

	test("uses signal-driven delete confirmation", () => {
		const html = viewPanel(alice, "v-other");
		expect(html).toContain("confirmDel");
		expect(html).toContain("Are you sure?");
		expect(html).toContain("Confirm");
	});

	test("shows Volunteer role for non-admin", () => {
		const html = viewPanel(bob, "v-other");
		expect(html).toContain("Volunteer");
	});
});

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

	test("has Save and Cancel buttons", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("Save");
		expect(html).toContain("Cancel");
	});

	test("uses @put for existing volunteer", () => {
		const html = editPanel(alice, "v-other");
		expect(html).toContain("@put");
		expect(html).toContain("/volunteers/v-1");
	});

	test("disables admin checkbox when editing self", () => {
		const html = editPanel(alice, "v-1");
		expect(html).toContain("disabled");
		expect(html).toContain("Cannot change your own admin status");
	});

	test("does not disable admin checkbox when editing other", () => {
		const html = editPanel(alice, "v-other");
		expect(html).not.toContain("Cannot change your own admin status");
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

	test("has Create and Cancel buttons", () => {
		const html = createPanel();
		expect(html).toContain("Create");
		expect(html).toContain("Cancel");
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
});
