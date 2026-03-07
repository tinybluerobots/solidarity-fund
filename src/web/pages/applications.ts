import type { ApplicationRow } from "../../domain/application/repository";
import { layout } from "./layout";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function statusBadge(status: string): string {
	const colors: Record<string, string> = {
		accepted: "bg-blue-50 text-blue-700 border-blue-200",
		flagged: "bg-amber-50 text-amber-700 border-amber-200",
		rejected: "bg-red-50 text-red-700 border-red-200",
		selected: "bg-green-50 text-green-700 border-green-200",
		not_selected: "bg-gray-50 text-gray-600 border-gray-200",
		applied: "bg-cream-100 text-bark-muted border-cream-200",
	};
	const cls = colors[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
	const label = status
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}">${escapeHtml(label)}</span>`;
}

function paymentBadge(pref: string): string {
	if (pref === "bank") {
		return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">Bank</span>`;
	}
	return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">Cash</span>`;
}

export function applicationRow(a: ApplicationRow): string {
	return `<tr
		class="border-b border-cream-200 hover:bg-cream-50 cursor-pointer transition-colors"
		data-on-click="@get('/applications/${encodeURIComponent(a.id)}')">
		<td class="px-4 py-3 font-medium text-bark">${escapeHtml(a.name ?? "")}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(a.phone ?? "")}</td>
		<td class="px-4 py-3">${statusBadge(a.status)}</td>
		<td class="px-4 py-3">${paymentBadge(a.paymentPreference)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${a.appliedAt ? formatDate(a.appliedAt) : ""}</td>
	</tr>`;
}

export function applicationsTableBody(applications: ApplicationRow[]): string {
	const emptyRow = `<tr><td colspan="5" class="text-center py-12 text-bark-muted">No applications for this month</td></tr>`;
	const rows =
		applications.length === 0
			? emptyRow
			: applications.map(applicationRow).join("\n");
	return `<tbody id="application-rows">${rows}</tbody>`;
}

export function applicationsPage(
	applications: ApplicationRow[],
	months: string[],
	currentMonth: string,
): string {
	const monthOptions = months
		.map(
			(m) =>
				`<option value="${escapeHtml(m)}"${m === currentMonth ? " selected" : ""}>${escapeHtml(m)}</option>`,
		)
		.join("\n");

	const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"month": "${escapeHtml(currentMonth)}"}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Applications</h1>
		</div>
		<select
			data-bind-month
			data-on-change="@get('/applications?month=' + $month)"
			class="px-3 py-2 rounded-lg border border-cream-300 bg-white text-bark text-sm focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent">
			${monthOptions}
		</select>
	</div>

	<div class="bg-white rounded-xl border border-cream-200 shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="border-b-2 border-cream-300 bg-cream-100">
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Phone</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Status</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Payment</th>
						<th class="px-4 py-3 text-sm font-semibold text-bark-muted uppercase tracking-wide">Applied</th>
					</tr>
				</thead>
				${applicationsTableBody(applications)}
			</table>
		</div>
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Applications", body);
}
