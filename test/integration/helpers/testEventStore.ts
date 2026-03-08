import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../../src/domain/applicant/repository.ts";
import { SQLiteApplicantRepository } from "../../../src/infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../../../src/infrastructure/eventStore.ts";

export type TestEnv = {
	eventStore: SQLiteEventStore;
	pool: ReturnType<typeof SQLiteConnectionPool>;
	applicantRepo: ApplicantRepository;
	cleanup: () => Promise<void>;
};

export async function createTestEnv(): Promise<TestEnv> {
	const es = createEventStore(":memory:");
	const applicantRepo = await SQLiteApplicantRepository(es.pool);
	return {
		eventStore: es.store,
		pool: es.pool,
		applicantRepo,
		cleanup: () => es.pool.close(),
	};
}
