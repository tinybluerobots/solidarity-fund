import { describe, expect, test } from "bun:test";
import { isValidPhone, normalizePhone } from "./normalizePhone.ts";

describe("normalizePhone", () => {
	test("strips spaces from UK mobile", () => {
		expect(normalizePhone("07777 777777")).toBe("07777777777");
	});

	test("strips plus and spaces from international format", () => {
		expect(normalizePhone("+44 7777 777777")).toBe("447777777777");
	});

	test("strips dashes", () => {
		expect(normalizePhone("020-7946-0958")).toBe("02079460958");
	});

	test("strips parentheses", () => {
		expect(normalizePhone("(020) 7946 0958")).toBe("02079460958");
	});

	test("leaves pure digits unchanged", () => {
		expect(normalizePhone("07777777777")).toBe("07777777777");
	});

	test("strips dots from formatted numbers", () => {
		expect(normalizePhone("077.7777.7777")).toBe("07777777777");
	});

	test("returns empty string for no digits", () => {
		expect(normalizePhone("++--  ")).toBe("");
	});
});

describe("isValidPhone", () => {
	test("accepts plain UK mobile", () => {
		expect(isValidPhone("07777777777")).toBe(true);
	});

	test("accepts spaced UK mobile", () => {
		expect(isValidPhone("07777 777777")).toBe(true);
	});

	test("accepts international format with plus", () => {
		expect(isValidPhone("+44 7777 777777")).toBe(true);
	});

	test("accepts US format with dashes", () => {
		expect(isValidPhone("555-123-4567")).toBe(true);
	});

	test("accepts parentheses format", () => {
		expect(isValidPhone("(020) 7946 0958")).toBe(true);
	});

	test("rejects too short (6 digits)", () => {
		expect(isValidPhone("123456")).toBe(false);
	});

	test("rejects too long (16 digits)", () => {
		expect(isValidPhone("1234567890123456")).toBe(false);
	});

	test("rejects empty string", () => {
		expect(isValidPhone("")).toBe(false);
	});

	test("rejects non-phone text", () => {
		expect(isValidPhone("hello")).toBe(false);
	});
});