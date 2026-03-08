import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../domain/applicant/repository.ts";
import type { VolunteerRepository } from "../domain/volunteer/repository.ts";
import { SQLiteApplicationRepository } from "../infrastructure/application/sqliteApplicationRepository.ts";
import { getSessionId } from "../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { changePasswordPage } from "./pages/changePassword.ts";
import { dashboardPage } from "./pages/dashboard.ts";
import { loginPage } from "./pages/login.ts";
import { createAltchaRoutes } from "./routes/altcha.ts";
import { createApplicantRoutes } from "./routes/applicants-admin.ts";
import { createApplicationRoutes } from "./routes/applications.ts";
import { createApplyRoutes } from "./routes/apply.ts";
import {
	handleChangePassword,
	handleLogin,
	handleLogout,
} from "./routes/auth.ts";
import { createLotteryRoutes } from "./routes/lottery.ts";
import { createVolunteerRoutes } from "./routes/volunteers.ts";

export async function getAuthenticatedVolunteer(
	req: Request,
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
) {
	const sid = getSessionId(req);
	if (!sid) return null;
	const volunteerId = await sessionStore.get(sid);
	if (!volunteerId) return null;
	return volunteerRepo.getById(volunteerId);
}

export function startServer(
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
	applicantRepo: ApplicantRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	port = 3000,
) {
	const login = handleLogin(sessionStore, volunteerRepo);
	const logout = handleLogout(sessionStore);
	const loginHtml = loginPage();
	const hmacKey = process.env.ALTCHA_HMAC_KEY ?? "change-me-in-production";
	const applyRoutes = createApplyRoutes(
		eventStore,
		pool,
		applicantRepo,
		hmacKey,
	);
	const applicantRoutes = createApplicantRoutes(
		applicantRepo,
		volunteerRepo,
		eventStore,
	);
	const volunteerRoutes = createVolunteerRoutes(volunteerRepo, eventStore);
	const appRepo = SQLiteApplicationRepository(pool);
	const applicationRoutes = createApplicationRoutes(
		appRepo,
		applicantRepo,
		eventStore,
		pool,
	);
	const lotteryRoutes = createLotteryRoutes(appRepo, eventStore, pool);
	const altchaRoutes = createAltchaRoutes(hmacKey);
	const changePasswordHandler = handleChangePassword(volunteerRepo, eventStore);

	async function requireAuth(req: Request) {
		return getAuthenticatedVolunteer(req, sessionStore, volunteerRepo);
	}

	return Bun.serve({
		port,
		routes: {
			"/apply": {
				GET: () => applyRoutes.showForm(),
				POST: (req) => applyRoutes.handleSubmit(req),
			},
			"/apply/result": {
				GET: (req) => applyRoutes.showResult(req),
			},
			"/api/altcha/challenge": {
				GET: () => altchaRoutes.challenge(),
			},
			"/scripts/altcha.js": {
				GET: async () => {
					const file = Bun.file("node_modules/altcha/dist/altcha.js");
					return new Response(file, {
						headers: { "Content-Type": "application/javascript" },
					});
				},
			},
			"/styles/app.css": {
				GET: async () => {
					const file = Bun.file("src/web/styles/dist/app.css");
					return new Response(file, {
						headers: { "Content-Type": "text/css" },
					});
				},
			},
			"/": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return new Response(dashboardPage(volunteer), {
						headers: { "Content-Type": "text/html" },
					});
				},
			},
			"/login": {
				GET: () =>
					new Response(loginHtml, {
						headers: { "Content-Type": "text/html" },
					}),
				POST: (req) => login(req),
			},
			"/logout": {
				GET: (req) => logout(req),
			},
			"/change-password": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return new Response(changePasswordPage(), {
						headers: { "Content-Type": "text/html" },
					});
				},
				POST: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return changePasswordHandler(req, volunteer.id);
				},
			},
			"/volunteers": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return volunteerRoutes.list();
				},
			},
			"/volunteers/new": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return volunteerRoutes.create();
				},
			},
			"/volunteers/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					if (!volunteer.isAdmin)
						return new Response("Forbidden", { status: 403 });
					return volunteerRoutes.closePanel();
				},
			},
			"/applications": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					const url = new URL(req.url);
					return applicationRoutes.list(
						url.searchParams.get("month") ?? undefined,
					);
				},
			},
			"/applications/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return applicationRoutes.closePanel();
				},
			},
			"/lottery": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return lotteryRoutes.show();
				},
			},
			"/applicants": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return applicantRoutes.list();
				},
			},
			"/applicants/new": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return applicantRoutes.create();
				},
			},
			"/applicants/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return applicantRoutes.closePanel();
				},
			},
		},
		async fetch(req) {
			const url = new URL(req.url);
			const volunteer = await requireAuth(req);
			if (!volunteer) return Response.redirect("/login", 302);

			if (url.pathname === "/volunteers" && req.method === "POST") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.handleCreate(req, volunteer.id);
			}

			const volHistoryMatch = url.pathname.match(
				/^\/volunteers\/([^/]+)\/history$/,
			);
			if (volHistoryMatch?.[1] && req.method === "GET") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.history(volHistoryMatch[1]);
			}

			const volEditMatch = url.pathname.match(/^\/volunteers\/([^/]+)\/edit$/);
			if (volEditMatch?.[1] && req.method === "GET") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.edit(volEditMatch[1], volunteer.id);
			}

			const volDisableMatch = url.pathname.match(
				/^\/volunteers\/([^/]+)\/disable$/,
			);
			if (volDisableMatch?.[1] && req.method === "POST") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.handleDisable(volDisableMatch[1], volunteer.id);
			}

			const volEnableMatch = url.pathname.match(
				/^\/volunteers\/([^/]+)\/enable$/,
			);
			if (volEnableMatch?.[1] && req.method === "POST") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.handleEnable(volEnableMatch[1], volunteer.id);
			}

			const volIdMatch = url.pathname.match(/^\/volunteers\/([^/]+)$/);
			if (volIdMatch?.[1]) {
				const id = volIdMatch[1];
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				if (req.method === "PUT")
					return volunteerRoutes.handleUpdate(id, req, volunteer.id);
			}

			// Application review (must come before detail match)
			const appReviewMatch = url.pathname.match(
				/^\/applications\/([^/]+)\/review$/,
			);
			if (appReviewMatch?.[1] && req.method === "POST") {
				const decision = new URL(req.url).searchParams.get("decision");
				if (decision === "confirm" || decision === "reject") {
					return applicationRoutes.handleReview(
						appReviewMatch[1],
						decision,
						volunteer.id,
					);
				}
				return new Response("Invalid decision", { status: 400 });
			}

			// Application detail
			const appIdMatch = url.pathname.match(/^\/applications\/([^/]+)$/);
			if (appIdMatch?.[1] && req.method === "GET") {
				return applicationRoutes.detail(appIdMatch[1]);
			}

			if (url.pathname === "/lottery/open" && req.method === "POST") {
				return lotteryRoutes.handleOpen();
			}
			if (url.pathname === "/lottery/close" && req.method === "POST") {
				return lotteryRoutes.handleClose();
			}
			if (url.pathname === "/lottery/draw" && req.method === "POST") {
				const signals = await req.json();
				const balance = Number(signals.availableBalance);
				const reserve = Number(signals.reserve);
				const grant = Number(signals.grantAmount);
				if ([balance, reserve, grant].some(Number.isNaN)) {
					return new Response("Invalid input", { status: 400 });
				}
				return lotteryRoutes.handleDraw(volunteer.id, balance, reserve, grant);
			}

			if (url.pathname === "/applicants" && req.method === "POST") {
				return applicantRoutes.handleCreate(req, volunteer.id);
			}

			const historyMatch = url.pathname.match(
				/^\/applicants\/([^/]+)\/history$/,
			);
			if (historyMatch?.[1] && req.method === "GET") {
				return applicantRoutes.history(historyMatch[1]);
			}

			const editMatch = url.pathname.match(/^\/applicants\/([^/]+)\/edit$/);
			if (editMatch?.[1] && req.method === "GET") {
				return applicantRoutes.edit(editMatch[1]);
			}

			const idMatch = url.pathname.match(/^\/applicants\/([^/]+)$/);
			if (idMatch?.[1]) {
				const id = idMatch[1];
				if (req.method === "PUT") {
					return applicantRoutes.handleUpdate(id, req, volunteer.id);
				}
				if (req.method === "DELETE") {
					return applicantRoutes.handleDelete(id, volunteer.id);
				}
			}

			return new Response("Not found", { status: 404 });
		},
	});
}
