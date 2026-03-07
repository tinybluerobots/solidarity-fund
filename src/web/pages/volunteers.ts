import type { Volunteer } from "../../domain/volunteer/types.ts";
import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeJsString(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/`/g, "\\`")
		.replace(/\$/g, "\\$");
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function adminBadge(isAdmin: boolean): string {
	if (!isAdmin) return "";
	return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">Admin</span>`;
}

export function volunteerRow(v: Volunteer): string {
	const nameLower = escapeJsString(v.name.toLowerCase());
	const phone = v.phone ? escapeJsString(v.phone) : "";
	const showExpr = `$search === '' || '${nameLower}'.includes($search.toLowerCase()) || '${phone}'.includes($search)`;
	return `<tr
		class="border-b border-cream-200 hover:bg-cream-50 cursor-pointer transition-colors"
		data-on-click="@get('/volunteers/${encodeURIComponent(v.id)}')"
		data-show="${escapeHtml(showExpr)}">
		<td class="px-4 py-3 font-medium text-bark">${escapeHtml(v.name)}</td>
		<td class="px-4 py-3 text-bark-muted">${v.phone ? escapeHtml(v.phone) : ""}</td>
		<td class="px-4 py-3 text-bark-muted">${v.email ? escapeHtml(v.email) : ""}</td>
		<td class="px-4 py-3">${adminBadge(v.isAdmin)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${formatDate(v.createdAt)}</td>
	</tr>`;
}

export function volunteersPage(volunteers: Volunteer[]): string {
	const emptyRow = `<tr><td colspan="5" class="text-center py-12 text-bark-muted">No volunteers yet</td></tr>`;
	const rows =
		volunteers.length === 0
			? emptyRow
			: volunteers.map(volunteerRow).join("\n");

	const tableOrEmpty = `<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-cream-300 bg-cream-100">
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Name</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Phone</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Email</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Role</th>
							<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Added</th>
						</tr>
					</thead>
					<tbody id="volunteer-rows">
						${rows}
					</tbody>
				</table>
			</div>`;

	const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"search": ""}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Volunteers</h1>
		</div>
		<button
			class="px-4 py-2 rounded-lg bg-amber text-white font-medium hover:bg-amber-dark transition-colors text-sm"
			data-on-click="@get('/volunteers/new')">
			Add Volunteer
		</button>
	</div>

	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by name or phone&hellip;"
			data-bind-search
			class="w-full max-w-sm px-3 py-2 rounded-lg border border-cream-300 bg-white text-bark placeholder-bark-muted focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent text-sm" />
	</div>

	<div class="bg-white rounded-xl border border-cream-200 shadow-sm">
		${tableOrEmpty}
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Volunteers", body);
}
