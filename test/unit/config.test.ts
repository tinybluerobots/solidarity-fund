import { describe, expect, test } from "bun:test";
import { getFundName, setFundName } from "../../src/config.ts";

describe("config", () => {
	test("default fund name", () => {
		expect(getFundName()).toBe("Cambridge Solidarity Fund");
	});

	test("setFundName overrides default", () => {
		setFundName("Test Fund");
		expect(getFundName()).toBe("Test Fund");
		setFundName("Cambridge Solidarity Fund");
	});
});
