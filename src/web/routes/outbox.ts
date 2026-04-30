import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { type OutboxRow, outboxPage } from "../pages/outbox.ts";

const PAGE_SIZE = 25;

const VALID_STATUSES = ["pending", "sending", "sent", "failed"];

export function parsePage(param: string | null, totalPages: number): number {
	const safeTotalPages = Math.max(1, totalPages);
	if (!param) return 1;
	const n = parseInt(param, 10);
	if (Number.isNaN(n)) return 1;
	return Math.min(Math.max(1, n), safeTotalPages);
}

export function calcOffset(page: number): number {
	return (page - 1) * PAGE_SIZE;
}

export function calcTotalPages(total: number): number {
	return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function createOutboxRoutes(
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async list(req: Request): Promise<Response> {
			try {
				const url = new URL(req.url);
				const statusFilter = url.searchParams.get("status");
				const isValidStatus =
					statusFilter && VALID_STATUSES.includes(statusFilter);

				const { rows, total, pages, page } = await pool.withConnection(
					async (conn) => {
						let countQuery = "SELECT COUNT(*) AS total FROM outbox_messages";
						let dataQuery = `SELECT id, event_stream, event_position, event_type, channel, recipient, body, status, created_at, sent_at, error, message_id
               FROM outbox_messages`;

						const params: (string | number)[] = [];

						if (isValidStatus) {
							countQuery += " WHERE status = ?";
							dataQuery += " WHERE status = ?";
							params.push(statusFilter);
						}

						const countRows = await conn.query<{ total: number }>(
							countQuery,
							params,
						);
						const total = countRows[0]?.total ?? 0;
						const pages = calcTotalPages(total);
						const page = parsePage(url.searchParams.get("page"), pages);
						const offset = calcOffset(page);

						dataQuery += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
						params.push(PAGE_SIZE, offset);

						const rows = await conn.query<OutboxRow>(dataQuery, params);

						return { rows, total, pages, page };
					},
				);

				const html = outboxPage(
					rows,
					page,
					pages,
					total,
					isValidStatus ? statusFilter : null,
				);
				return new Response(html, {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			} catch (err) {
				console.error("outbox route error:", err);
				return new Response("Internal error", { status: 500 });
			}
		},
	};
}
