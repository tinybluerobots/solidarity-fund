import { describe, expect, test } from "bun:test";
import { seededShuffle } from "../../src/domain/lottery/seededShuffle.ts";

describe("seededShuffle", () => {
	test("returns same order for same seed", () => {
		const items = ["a", "b", "c", "d", "e"];
		const result1 = seededShuffle(items, "seed-1");
		const result2 = seededShuffle(items, "seed-1");
		expect(result1).toEqual(result2);
	});

	test("returns different order for different seed", () => {
		const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
		const result1 = seededShuffle(items, "seed-1");
		const result2 = seededShuffle(items, "seed-2");
		expect(result1).not.toEqual(result2);
	});

	test("contains all original items", () => {
		const items = ["a", "b", "c", "d", "e"];
		const result = seededShuffle(items, "any-seed");
		expect(result.sort()).toEqual(["a", "b", "c", "d", "e"]);
	});

	test("does not mutate input array", () => {
		const items = ["a", "b", "c"];
		const original = [...items];
		seededShuffle(items, "seed-1");
		expect(items).toEqual(original);
	});

	test("empty array returns empty", () => {
		expect(seededShuffle([], "seed")).toEqual([]);
	});

	test("single item returns same item", () => {
		expect(seededShuffle(["x"], "seed")).toEqual(["x"]);
	});
});
