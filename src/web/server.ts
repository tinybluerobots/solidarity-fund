import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import type { RecipientRepository } from "../domain/recipient/repository.ts";
import type { VolunteerRepository } from "../domain/volunteer/repository.ts";
import { getSessionId } from "../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { dashboardPage } from "./pages/dashboard.ts";
import { loginPage } from "./pages/login.ts";
import { handleLogin, handleLogout } from "./routes/auth.ts";
import { createRecipientRoutes } from "./routes/recipients.ts";

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
	port = 3000,
) {
	const login = handleLogin(sessionStore, volunteerRepo);
	const logout = handleLogout(sessionStore);
	const loginHtml = loginPage();
	const recipientRoutes = createRecipientRoutes(recipientRepo, eventStore);

	async function requireAuth(req: Request) {
		return getAuthenticatedVolunteer(req, sessionStore, volunteerRepo);
	}

	return Bun.serve({
		port,
		routes: {
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
		},
		async fetch(req) {
			const url = new URL(req.url);
			const volunteer = await requireAuth(req);
			if (!volunteer) return Response.redirect("/login", 302);

			if (url.pathname === "/recipients" && req.method === "POST") {
				const form = await req.formData();
				return recipientRoutes.handleCreate(form, volunteer.id);
			}

			const editMatch = url.pathname.match(/^\/recipients\/([^/]+)\/edit$/);
			if (editMatch) {
				return recipientRoutes.edit(editMatch[1]!);
			}

			const idMatch = url.pathname.match(/^\/recipients\/([^/]+)$/);
			if (idMatch) {
				const id = idMatch[1]!;
				if (req.method === "GET") return recipientRoutes.detail(id);
				if (req.method === "PUT") {
					const form = await req.formData();
					return recipientRoutes.handleUpdate(id, form, volunteer.id);
				}
				if (req.method === "DELETE") {
					return recipientRoutes.handleDelete(id, volunteer.id);
				}
			}

			return new Response("Not found", { status: 404 });
		},
	});
}
