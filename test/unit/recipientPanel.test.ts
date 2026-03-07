import { describe, expect, test } from "bun:test";
import type { Recipient } from "../../src/domain/recipient/types";
import { createPanel, editPanel } from "../../src/web/pages/recipientPanel";

const alice: Recipient = {
	id: "r-1",
	phone: "07700900001",
	name: "Alice Smith",
	email: "alice@example.com",
	paymentPreference: "bank",
	bankDetails: { sortCode: "12-34-56", accountNumber: "12345678" },
	notes: "Prefers mornings",
	createdAt: "2026-03-01T00:00:00.000Z",
	updatedAt: "2026-03-01T00:00:00.000Z",
};

describe("editPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = editPanel(alice);
		expect(html).toContain("data-bind-name");
		expect(html).toContain("data-bind-phone");
		expect(html).toContain("data-bind-email");
	});

	test("pre-fills signal values", () => {
		const html = editPanel(alice);
		expect(html).toContain("Alice Smith");
		expect(html).toContain("07700900001");
		expect(html).toContain("alice@example.com");
	});

	test("has Save and Cancel buttons", () => {
		const html = editPanel(alice);
		expect(html).toContain("Save");
		expect(html).toContain("Cancel");
	});

	test("uses @put for existing recipient", () => {
		const html = editPanel(alice);
		expect(html).toContain("@put");
		expect(html).toContain("/recipients/r-1");
	});

	test("has delete button with confirmation", () => {
		const html = editPanel(alice);
		expect(html).toContain("Delete");
		expect(html).toContain("confirmDelete");
		expect(html).toContain("Sure?");
		expect(html).toContain("Confirm");
	});

	test("renders Details and History tabs", () => {
		const html = editPanel(alice);
		expect(html).toContain("Details");
		expect(html).toContain("History");
	});

	test("defaults to Details tab active", () => {
		const html = editPanel(alice);
		expect(html).toContain("activeTab: 'details'");
	});

	test("History tab triggers lazy load", () => {
		const html = editPanel(alice);
		expect(html).toContain(`/recipients/${alice.id}/history`);
	});

	test("Details content shown when details tab active", () => {
		const html = editPanel(alice);
		expect(html).toContain("data-show=\"$activeTab==='details'\"");
	});

	test("History content shown when history tab active", () => {
		const html = editPanel(alice);
		expect(html).toContain("data-show=\"$activeTab==='history'\"");
	});
});

describe("createPanel", () => {
	test("renders form with data-bind inputs", () => {
		const html = createPanel();
		expect(html).toContain("data-bind-name");
		expect(html).toContain("data-bind-phone");
	});

	test("initializes signals with empty values", () => {
		const html = createPanel();
		expect(html).toContain("name: ''");
		expect(html).toContain("phone: ''");
	});

	test("has Create and Cancel buttons", () => {
		const html = createPanel();
		expect(html).toContain("Create");
		expect(html).toContain("Cancel");
	});

	test("uses @post for new recipient", () => {
		const html = createPanel();
		expect(html).toContain("@post");
		expect(html).toContain("/recipients");
	});

	test("phone input has numeric pattern", () => {
		const html = createPanel();
		expect(html).toContain('pattern="[0-9]*"');
		expect(html).toContain('inputmode="numeric"');
	});
});
