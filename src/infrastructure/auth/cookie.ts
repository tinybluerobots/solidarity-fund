const COOKIE_NAME = "session";
const MAX_AGE = 86400; // 24 hours

export function setSessionCookie(sessionId: string): string {
	return `${COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function getSessionId(request: Request): string | null {
	const header = request.headers.get("cookie");
	if (!header) return null;
	const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	return match?.[1] ?? null;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
