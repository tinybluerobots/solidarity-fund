import type {
	ApplicationRepository,
	ApplicationRow,
} from "../../domain/application/repository.ts";
import type { GrantRepository } from "../../domain/grant/repository.ts";
import { statusLookupPage, statusTimelinePage } from "../pages/status.ts";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND_MSG =
	"We couldn't find an application with that reference number. Please check and try again.";

export function createStatusRoutes(
	appRepo: ApplicationRepository,
	grantRepo: GrantRepository,
) {
	return {
		async show(req: Request): Promise<Response> {
			const url = new URL(req.url);
			const ref = url.searchParams.get("ref")?.trim() ?? "";

			// No ref — show blank lookup form
			if (!ref) {
				return html(statusLookupPage());
			}

			// Malformed ref — skip DB query
			if (!UUID_RE.test(ref)) {
				return html(statusLookupPage(NOT_FOUND_MSG));
			}

			// Lookup application
			let app: ApplicationRow | null;
			try {
				app = await appRepo.getById(ref);
			} catch {
				return html(statusLookupPage(NOT_FOUND_MSG));
			}

			if (!app || app.status === "initial") {
				return html(statusLookupPage(NOT_FOUND_MSG));
			}

			// Lookup grant if selected
			let grant = null;
			if (app.status === "selected") {
				try {
					grant = await grantRepo.getByApplicationId(ref);
				} catch {
					// Non-fatal: render without grant (shows "volunteer being assigned")
				}
			}

			return html(statusTimelinePage(app, grant));
		},
	};
}

function html(body: string): Response {
	return new Response(body, { headers: { "Content-Type": "text/html" } });
}
