import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../domain/recipient/repository.ts";
import type { VolunteerRepository } from "../domain/volunteer/repository.ts";
import { SQLiteApplicationRepository } from "../infrastructure/application/sqliteApplicationRepository.ts";
import { getSessionId } from "../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { changePasswordPage } from "./pages/changePassword.ts";
import { dashboardPage } from "./pages/dashboard.ts";
import { loginPage } from "./pages/login.ts";
import { createApplicationRoutes } from "./routes/applications.ts";
import { createApplyRoutes } from "./routes/apply.ts";
import {
	handleChangePassword,
	handleLogin,
	handleLogout,
} from "./routes/auth.ts";
import { createRecipientRoutes } from "./routes/recipients.ts";
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
	recipientRepo: RecipientRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	port = 3000,
) {
	const login = handleLogin(sessionStore, volunteerRepo);
	const logout = handleLogout(sessionStore);
	const loginHtml = loginPage();
	const applyRoutes = createApplyRoutes(eventStore, pool, recipientRepo);
	const recipientRoutes = createRecipientRoutes(recipientRepo, eventStore);
	const volunteerRoutes = createVolunteerRoutes(volunteerRepo, eventStore);
	const appRepo = SQLiteApplicationRepository(pool);
	const applicationRoutes = createApplicationRoutes(
		appRepo,
		recipientRepo,
		eventStore,
		pool,
	);
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
			"/recipients": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return recipientRoutes.list();
				},
			},
			"/recipients/new": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return recipientRoutes.create();
				},
			},
			"/recipients/close": {
				GET: async (req) => {
					const volunteer = await requireAuth(req);
					if (!volunteer) return Response.redirect("/login", 302);
					return recipientRoutes.closePanel();
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

			const volEditMatch = url.pathname.match(/^\/volunteers\/([^/]+)\/edit$/);
			if (volEditMatch?.[1] && req.method === "GET") {
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				return volunteerRoutes.edit(volEditMatch[1], volunteer.id);
			}

			const volIdMatch = url.pathname.match(/^\/volunteers\/([^/]+)$/);
			if (volIdMatch?.[1]) {
				const id = volIdMatch[1];
				if (!volunteer.isAdmin)
					return new Response("Forbidden", { status: 403 });
				if (req.method === "GET")
					return volunteerRoutes.detail(id, volunteer.id);
				if (req.method === "PUT")
					return volunteerRoutes.handleUpdate(id, req, volunteer.id);
				if (req.method === "DELETE")
					return volunteerRoutes.handleDelete(id, volunteer.id);
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

			if (url.pathname === "/recipients" && req.method === "POST") {
				return recipientRoutes.handleCreate(req, volunteer.id);
			}

			const editMatch = url.pathname.match(/^\/recipients\/([^/]+)\/edit$/);
			if (editMatch?.[1] && req.method === "GET") {
				return recipientRoutes.edit(editMatch[1]);
			}

			const idMatch = url.pathname.match(/^\/recipients\/([^/]+)$/);
			if (idMatch?.[1]) {
				const id = idMatch[1];
				if (req.method === "GET") return recipientRoutes.detail(id);
				if (req.method === "PUT") {
					return recipientRoutes.handleUpdate(id, req, volunteer.id);
				}
				if (req.method === "DELETE") {
					return recipientRoutes.handleDelete(id, volunteer.id);
				}
			}

			return new Response("Not found", { status: 404 });
		},
	});
}
