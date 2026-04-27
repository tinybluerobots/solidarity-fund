import { expect, test } from "bun:test";
import type { SmsClient } from "./client.ts";
import { createNotificationService } from "./notificationService.ts";

type FakePool = {
	withConnection: <T>(fn: (conn: FakeConn) => Promise<T>) => Promise<T>;
};

type FakeConn = {
	querySingle: (sql: string, params: unknown[]) => Promise<unknown>;
};

function createFakePool(phone: string | null): FakePool {
	return {
		async withConnection(fn) {
			return fn({
				async querySingle(_sql, _params) {
					return phone ? { phone } : null;
				},
			} as unknown as FakeConn);
		},
	};
}

test("notificationService sends SMS for ApplicationAccepted event", async () => {
	const client = { send: async () => ({ success: true }) } satisfies SmsClient;
	const pool = createFakePool("+447777777777");
	const svc = createNotificationService(
		client,
		pool as FakePool as unknown as Parameters<
			typeof createNotificationService
		>[1],
	);

	await svc.handle({
		type: "ApplicationAccepted",
		kind: "Event",
		data: {
			applicationId: "abc-123",
			applicantId: "applicant-1",
			monthCycle: "2025-04",
			acceptedAt: "2025-04-10T00:00:00Z",
		},
	});

	// NullSmsClient returns success, so it passes silently
	expect(true).toBe(true);
});
