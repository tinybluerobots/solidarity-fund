import { describe, expect, test } from "bun:test";
import {
	clearSessionCookie,
	getSessionId,
	setSessionCookie,
} from "../../src/infrastructure/auth/cookie.ts";

describe("cookie helpers", () => {
	test("setSessionCookie returns HttpOnly cookie with correct attributes", () => {
		const cookie = setSessionCookie("abc-123");
		expect(cookie).toContain("session=abc-123");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain("Path=/");
		expect(cookie).toContain("Max-Age=86400");
	});

	test("getSessionId extracts session from cookie header", () => {
		const req = new Request("http://localhost/", {
			headers: { cookie: "session=abc-123" },
		});
		expect(getSessionId(req)).toBe("abc-123");
	});

	test("getSessionId handles multiple cookies", () => {
		const req = new Request("http://localhost/", {
			headers: { cookie: "other=xyz; session=abc-123; foo=bar" },
		});
		expect(getSessionId(req)).toBe("abc-123");
	});

	test("getSessionId returns null when no cookie header", () => {
		const req = new Request("http://localhost/");
		expect(getSessionId(req)).toBeNull();
	});

	test("getSessionId returns null when session cookie missing", () => {
		const req = new Request("http://localhost/", {
			headers: { cookie: "other=xyz" },
		});
		expect(getSessionId(req)).toBeNull();
	});

	test("clearSessionCookie expires the cookie", () => {
		const cookie = clearSessionCookie();
		expect(cookie).toContain("session=");
		expect(cookie).toContain("Max-Age=0");
	});
});
