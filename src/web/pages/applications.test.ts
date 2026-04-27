import { describe, expect, it } from "bun:test";
import { STATUS_OPTIONS, statusBadge } from "./applications.ts";

describe("statusBadge", () => {
	it("renders confirmed with same styling as accepted", () => {
		const result = statusBadge("confirmed");
		expect(result).toContain("bg-blue-50");
		expect(result).toContain("text-blue-700");
		expect(result).toContain("Confirmed");
	});

	it("renders accepted", () => {
		const result = statusBadge("accepted");
		expect(result).toContain("bg-blue-50");
		expect(result).toContain("text-blue-700");
		expect(result).toContain("Accepted");
	});

	it("renders flagged", () => {
		const result = statusBadge("flagged");
		expect(result).toContain("bg-amber-50");
		expect(result).toContain("Flagged");
	});

	it("renders applied", () => {
		const result = statusBadge("applied");
		expect(result).toContain("Applied");
	});

	it("falls back to gray for unknown status", () => {
		const result = statusBadge("some_random_status");
		expect(result).toContain("bg-gray-50");
		expect(result).toContain("Some Random Status");
	});

	it("escapes HTML in status name", () => {
		const result = statusBadge('<script>alert("xss")</script>');
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;Script&gt;");
	});
});

describe("STATUS_OPTIONS", () => {
	it("includes confirmed", () => {
		const confirmed = STATUS_OPTIONS.find((o) => o.value === "confirmed");
		expect(confirmed).toBeDefined();
		expect(confirmed?.label).toBe("Confirmed");
	});

	it("includes all expected statuses", () => {
		const values = STATUS_OPTIONS.map((o) => o.value);
		expect(values).toContain("all");
		expect(values).toContain("applied");
		expect(values).toContain("accepted");
		expect(values).toContain("confirmed");
		expect(values).toContain("flagged");
		expect(values).toContain("rejected");
		expect(values).toContain("selected");
		expect(values).toContain("not_selected");
	});

	it("has 8 entries", () => {
		expect(STATUS_OPTIONS.length).toBe(8);
	});
});
