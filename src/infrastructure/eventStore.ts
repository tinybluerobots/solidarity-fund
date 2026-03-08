import { inlineProjections } from "@event-driven-io/emmett";
import {
	getSQLiteEventStore,
	SQLiteConnectionPool,
	type SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { applicantProjection } from "./projections/applicant.ts";
import { applicationsProjection } from "./projections/applications.ts";
import { grantProjection } from "./projections/grant.ts";
import { lotteryWindowProjection } from "./projections/lotteryWindow.ts";
import { volunteerProjection } from "./projections/volunteer.ts";

export type EventStoreWithPool = {
	store: SQLiteEventStore;
	pool: ReturnType<typeof SQLiteConnectionPool>;
};

export function createEventStore(fileName: string): EventStoreWithPool {
	const pool = SQLiteConnectionPool({ fileName });
	const store = getSQLiteEventStore({
		fileName: undefined,
		pool,
		schema: { autoMigration: "CreateOrUpdate" },
		projections: inlineProjections([
			applicantProjection,
			applicationsProjection,
			grantProjection,
			volunteerProjection,
			lotteryWindowProjection,
		]),
	});
	return { store, pool };
}
