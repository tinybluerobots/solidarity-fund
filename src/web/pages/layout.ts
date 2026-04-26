import { getFundName } from "../../config.ts";

export function layout(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(getFundName())} - ${escapeHtml(title)}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
	<link rel="icon" type="image/x-icon" href="/favicon.ico">
	<link rel="icon" type="image/png" href="/solidarity.png">
	<link rel="stylesheet" href="/styles/app.css">
	<script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.1/bundles/datastar.js"></script>
	<style>
		body { background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E"); }
	</style>
</head>
<body class="font-body bg-cream-100 text-bark min-h-screen">
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
