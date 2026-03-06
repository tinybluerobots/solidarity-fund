import type { VolunteerRepository } from "../domain/volunteer/repository.ts";
import { getSessionId } from "../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { loginPage } from "./pages/login.ts";
import { handleLogin, handleLogout } from "./routes/auth.ts";

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
	port = 3000,
) {
	const login = handleLogin(sessionStore, volunteerRepo);
	const logout = handleLogout(sessionStore);
	const loginHtml = loginPage();

	return Bun.serve({
		port,
		routes: {
			"/": {
				GET: async (req) => {
					const volunteer = await getAuthenticatedVolunteer(
						req,
						sessionStore,
						volunteerRepo,
					);
					if (!volunteer) {
						return Response.redirect("/login", 302);
					}
					return new Response(`Welcome, ${volunteer.name}!`, {
						headers: { "Content-Type": "text/plain" },
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
		},
	});
}
