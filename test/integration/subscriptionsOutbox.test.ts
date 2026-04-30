import { describe, expect, test } from "bun:test";
import { createOutboxStore } from "../../src/infrastructure/outbox/store.ts";
import { startEventSubscriptions } from "../../src/subscriptions.ts";
import { createTestEnv } from "./helpers/testEventStore.ts";

describe("Event Subscriptions - Outbox", () => {
	test("writes ApplicationAccepted events to outbox", async () => {
		const env = await createTestEnv();
		const outboxStore = createOutboxStore(env.pool);

		const streamName = "application-app-1";
		await env.eventStore.appendToStream(streamName, [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "cash",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T10:00:00Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-07700900001",
					monthCycle: "2026-03",
					acceptedAt: "2026-03-01T10:00:00Z",
				},
			},
		]);

		const consumer = await startEventSubscriptions(env.eventStore, env.pool);

		await new Promise((resolve) => setTimeout(resolve, 500));

		const pendingMessages = await env.pool.withConnection((conn) =>
			outboxStore.getPendingMessages(conn, 10),
		);

		expect(pendingMessages).toHaveLength(1);
		expect(pendingMessages[0]!.eventType).toBe("ApplicationSubmitted");
		expect(pendingMessages[0]!.recipient).toBe("07700900001");
		expect(pendingMessages[0]!.channel).toBe("sms");
		expect(pendingMessages[0]!.status).toBe("pending");

		await consumer.stop();
		await env.cleanup();
	});

	test("is idempotent - restart does not create duplicates", async () => {
		const env = await createTestEnv();
		const outboxStore = createOutboxStore(env.pool);

		const streamName = "application-app-2";
		await env.eventStore.appendToStream(streamName, [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-2",
					applicantId: "applicant-07700900002",
					identity: { phone: "07700900002", name: "Bob" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					monthCycle: "2026-03",
					submittedAt: "2026-03-01T10:00:00Z",
				},
			},
		]);

		const consumer1 = await startEventSubscriptions(env.eventStore, env.pool);
		await new Promise((resolve) => setTimeout(resolve, 500));
		await consumer1.stop();

		const afterFirst = await env.pool.withConnection((conn) =>
			outboxStore.getPendingMessages(conn, 10),
		);
		expect(afterFirst).toHaveLength(1);

		const consumer2 = await startEventSubscriptions(env.eventStore, env.pool);
		await new Promise((resolve) => setTimeout(resolve, 500));
		await consumer2.stop();

		const afterSecond = await env.pool.withConnection((conn) =>
			outboxStore.getPendingMessages(conn, 10),
		);
		expect(afterSecond).toHaveLength(1);

		await env.cleanup();
	});
});
