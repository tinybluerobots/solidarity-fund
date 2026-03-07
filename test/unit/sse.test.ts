import { describe, test, expect } from "bun:test";
import { patchElements, patchSignals, sseResponse } from "../../src/web/sse";

describe("SSE helpers", () => {
	test("patchElements formats a single fragment", () => {
		const result = patchElements('<div id="panel">Hello</div>');
		expect(result).toBe('event: datastar-patch-elements\ndata: elements <div id="panel">Hello</div>\n\n');
	});

	test("patchElements with mode and selector", () => {
		const result = patchElements("<p>Hi</p>", { selector: "#target", mode: "inner" });
		expect(result).toBe(
			"event: datastar-patch-elements\ndata: selector #target\ndata: mode inner\ndata: elements <p>Hi</p>\n\n"
		);
	});

	test("patchElements handles multiline HTML", () => {
		const html = '<div id="x">\n  <p>Line1</p>\n  <p>Line2</p>\n</div>';
		const result = patchElements(html);
		expect(result).toContain("data: elements <div");
		expect(result).toContain("data: elements   <p>Line1</p>");
	});

	test("patchSignals formats signals object", () => {
		const result = patchSignals({ search: "", panelOpen: false });
		expect(result).toBe('event: datastar-patch-signals\ndata: signals {"search":"","panelOpen":false}\n\n');
	});

	test("sseResponse creates Response with correct headers", () => {
		const res = sseResponse("event: datastar-patch-elements\ndata: elements <div>hi</div>\n\n");
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
		expect(res.headers.get("Cache-Control")).toBe("no-cache");
	});
});
