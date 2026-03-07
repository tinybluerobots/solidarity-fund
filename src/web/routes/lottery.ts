import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import {
	closeApplicationWindow,
	drawLottery,
	openApplicationWindow,
} from "../../domain/lottery/commandHandlers.ts";
import { processLotteryDrawn } from "../../domain/lottery/processManager.ts";
import type { LotteryDrawn } from "../../domain/lottery/types.ts";
import { lotteryContent, lotteryPage } from "../pages/lottery.ts";
import { patchElements, sseResponse } from "../sse.ts";

function currentMonthCycle(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

type LotteryWindowRow = { month_cycle: string; status: string };

async function getWindowStatus(
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<"initial" | "open" | "windowClosed" | "drawn"> {
	const connection = await pool.connection();
	try {
		const tableCheck = connection.querySingle<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (!tableCheck) return "initial";

		const row = connection.querySingle<LotteryWindowRow>(
			"SELECT month_cycle, status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
			[monthCycle],
		);
		if (!row) return "initial";
		if (row.status === "open") return "open";
		if (row.status === "closed") return "windowClosed";
		if (row.status === "drawn") return "drawn";
		return "initial";
	} finally {
		connection.close();
	}
}

export function createLotteryRoutes(
	appRepo: ApplicationRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	const monthCycle = currentMonthCycle();

	return {
		async show(): Promise<Response> {
			const status = await getWindowStatus(monthCycle, pool);
			return new Response(lotteryPage(monthCycle, status), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async handleOpen(): Promise<Response> {
			await openApplicationWindow(monthCycle, eventStore);
			return sseResponse(
				patchElements(lotteryContent(monthCycle, "open")),
			);
		},

		async handleClose(): Promise<Response> {
			await closeApplicationWindow(monthCycle, eventStore);
			return sseResponse(
				patchElements(lotteryContent(monthCycle, "windowClosed")),
			);
		},

		async handleDraw(
			volunteerId: string,
			availableBalance: number,
			reserve: number,
			grantAmount: number,
		): Promise<Response> {
			const applications = await appRepo.listByMonth(monthCycle);
			const applicantPool = applications
				.filter((a) => a.status === "accepted")
				.map((a) => ({
					applicationId: a.id,
					applicantId: a.applicantId,
				}));

			await drawLottery(
				monthCycle,
				volunteerId,
				availableBalance,
				reserve,
				grantAmount,
				applicantPool,
				eventStore,
			);

			// Read back the LotteryDrawn event to feed the process manager
			const stream = await eventStore.readStream(`lottery-${monthCycle}`);
			const drawnEvent = stream.events.find(
				(e) => e.type === "LotteryDrawn",
			) as LotteryDrawn | undefined;
			if (drawnEvent) {
				await processLotteryDrawn(drawnEvent, eventStore);
			}

			return Response.redirect(`/applications?month=${monthCycle}`, 303);
		},
	};
}
