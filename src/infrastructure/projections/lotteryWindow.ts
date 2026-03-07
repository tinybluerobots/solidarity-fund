import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { LotteryEvent } from "../../domain/lottery/types.ts";

export const lotteryWindowProjection = sqliteProjection<LotteryEvent>({
	canHandle: ["ApplicationWindowOpened", "ApplicationWindowClosed"],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS lottery_windows (
				month_cycle TEXT PRIMARY KEY,
				status TEXT NOT NULL
			)
		`);
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationWindowOpened":
					await connection.command(
						`INSERT OR REPLACE INTO lottery_windows (month_cycle, status) VALUES (?, 'open')`,
						[data.monthCycle],
					);
					break;
				case "ApplicationWindowClosed":
					await connection.command(
						`UPDATE lottery_windows SET status = 'closed' WHERE month_cycle = ?`,
						[data.monthCycle],
					);
					break;
			}
		}
	},
});
