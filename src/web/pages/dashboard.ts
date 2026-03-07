import type { Volunteer } from "../../domain/volunteer/types.ts";
import { layout } from "./layout.ts";

export function dashboardPage(volunteer: Volunteer): string {
	return layout(
		"Dashboard",
		`
	<div class="max-w-2xl mx-auto px-4 py-8">
		<div class="flex items-center justify-between mb-8">
			<h1 class="font-heading font-bold text-2xl">Community Support Fund</h1>
			<a href="/logout" class="px-4 py-2 rounded-md font-heading font-semibold text-sm text-bark-muted border border-cream-200 hover:bg-cream-100 transition-colors no-underline">
				Sign Out
			</a>
		</div>

		<p class="text-bark-muted mb-8">Hello, ${escapeHtml(volunteer.name)}.</p>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			${navCard("/recipients", "\u{1F465}", "Recipients", "View and manage grant recipients")}
			${navCard("/applications", "\u{1F4CB}", "Applications", "Review incoming applications")}
			${navCard("/grants", "\u{1F4B7}", "Grants", "Track grant payments")}
			${navCard("/lottery", "\u{1F3B2}", "Lottery", "Run monthly draws")}
			${volunteer.isAdmin ? navCard("/volunteers", "\u{1F9D1}\u{200D}\u{1F91D}\u{200D}\u{1F9D1}", "Volunteers", "Manage volunteer accounts") : ""}
		</div>
	</div>
`,
	);
}

function navCard(
	href: string,
	icon: string,
	title: string,
	description: string,
): string {
	return `<a href="${href}" class="bg-cream-50 border border-cream-200 rounded-xl p-6 no-underline text-inherit shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md animate-[fadeIn_0.4s_ease-out]">
	<span class="text-2xl block mb-2">${icon}</span>
	<h3 class="font-heading font-semibold text-bark mb-1">${title}</h3>
	<p class="text-sm text-bark-muted leading-relaxed">${description}</p>
</a>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
