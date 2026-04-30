import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { initOutboxSchema } from "./infrastructure/outbox/schema.ts";
import { createOutboxStore } from "./infrastructure/outbox/store.ts";
import type { OutboxChannel } from "./infrastructure/outbox/types.ts";
import { renderSmsNotification } from "./infrastructure/sms/notificationRenderer.ts";

export async function startEventSubscriptions(
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	await pool.withConnection(async (conn) => {
		await initOutboxSchema(conn);
	});

	const outboxStore = createOutboxStore(pool);

	const consumer = eventStore.consumer();
	consumer.processor({
		processorId: "sms-notifications",
		version: 2,
		startFrom: "BEGINNING",
		eachMessage: async (event, context) => {
			if (!event.kind || event.kind !== "Event") return;

			const notification = await renderSmsNotification(event, pool);
			if (!notification) return;

			await outboxStore.recordMessage(context.connection, {
				eventStream: event.metadata.streamName,
				eventPosition: event.metadata.streamPosition,
				eventType: event.type,
				channel: notification.channel as OutboxChannel,
				recipient: notification.recipient,
				body: notification.body,
				createdAt: new Date().toISOString(),
			});
		},
	});

	consumer.start();
	return consumer;
}
