import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { type LogRow, logsPage } from "../pages/logs.ts";

const PAGE_SIZE = 25;

export function parsePage(param: string | null, totalPages: number): number {
	const safeTotalPages = Math.max(1, totalPages);
	if (!param) return 1;
	const n = parseInt(param, 10);
	if (isNaN(n)) return 1;
	return Math.min(Math.max(1, n), safeTotalPages);
}

export function calcOffset(page: number): number {
	return (page - 1) * PAGE_SIZE;
}

export function calcTotalPages(total: number): number {
	return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function createLogsRoutes(
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async list(req: Request): Promise<Response> {
			try {
				const url = new URL(req.url);

				const { rows, total, pages, page } = await pool.withConnection(
					async (conn) => {
						const countRows = await conn.query<{ total: number }>(
							`SELECT COUNT(*) AS total FROM emt_messages WHERE message_kind = 'E'`,
							[],
						);
						const total = countRows[0]?.total ?? 0;
						const pages = calcTotalPages(total);
						const page = parsePage(url.searchParams.get("page"), pages);
						const offset = calcOffset(page);

						const rows = await conn.query<LogRow>(
							`SELECT global_position, created, message_type, message_data
               FROM emt_messages
               WHERE message_kind = 'E'
               ORDER BY global_position DESC
               LIMIT ? OFFSET ?`,
							[PAGE_SIZE, offset],
						);

						return { rows, total, pages, page };
					},
				);

				const html = logsPage(rows, page, pages, total);
				return new Response(html, {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			} catch (err) {
				console.error("logs route error:", err);
				return new Response("Internal error", { status: 500 });
			}
		},
	};
}
