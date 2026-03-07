import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { EligibilityResult } from "./types.ts";

const COOLDOWN_MONTHS = 3;

function monthsAgo(monthCycle: string, n: number): string {
	const [year, month] = monthCycle.split("-").map(Number) as [number, number];
	const date = new Date(year, month - 1 - n, 1);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export async function checkEligibility(
	applicantId: string,
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<EligibilityResult> {
	return pool.withConnection(async (conn) => {
		// Check if lottery_windows table exists
		const windowTables = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (windowTables.length === 0) {
			return { status: "window_closed" } as const;
		}

		// Check window status
		const windowRows = await conn.query<{ status: string }>(
			"SELECT status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
			[monthCycle],
		);
		if (windowRows.length === 0 || windowRows[0]?.status !== "open") {
			return { status: "window_closed" } as const;
		}

		const tables = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='applications'",
		);
		if (tables.length === 0) {
			return { status: "eligible" } as const;
		}

		// Check for duplicate: any application this month that isn't rejected or flagged
		const dupes = await conn.query<{ id: string }>(
			`SELECT id FROM applications
			 WHERE applicant_id = ?
			   AND month_cycle = ?
			   AND status NOT IN ('rejected', 'flagged')
			 LIMIT 1`,
			[applicantId, monthCycle],
		);
		if (dupes.length > 0) {
			return { status: "duplicate" } as const;
		}

		// Check cooldown: selected in last 3 months
		const rows = await conn.query<{ month_cycle: string }>(
			`SELECT month_cycle FROM applications
			 WHERE applicant_id = ?
			   AND status = 'selected'
			   AND month_cycle >= ?
			 ORDER BY month_cycle DESC
			 LIMIT 1`,
			[applicantId, monthsAgo(monthCycle, COOLDOWN_MONTHS)],
		);

		if (rows.length === 0 || !rows[0]) {
			return { status: "eligible" } as const;
		}

		return {
			status: "cooldown",
			lastGrantMonth: rows[0].month_cycle,
		} as const;
	});
}
