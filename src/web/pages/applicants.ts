import type { Applicant } from "../../domain/applicant/types.ts";
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

export function applicantRow(r: Applicant): string {
	const nameLower = escapeJsString(r.name.toLowerCase());
	const phone = escapeJsString(r.phone);
	const showExpr = `$search === '' || '${nameLower}'.includes($search.toLowerCase()) || '${phone}'.includes($search)`;
	return `<tr
		class="table-row"
		data-on:click="@get('/applicants/${encodeURIComponent(r.id)}/edit')"
		data-show="${escapeHtml(showExpr)}">
		<td class="px-4 py-3 font-medium text-bark">${escapeHtml(r.name)}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(r.phone)}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(r.email ?? "")}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${formatDate(r.createdAt)}</td>
	</tr>`;
}

export function applicantsPage(applicants: Applicant[]): string {
	const emptyRow = `<tr><td colspan="4" class="text-center py-12 text-bark-muted">No applicants yet</td></tr>`;
	const rows =
		applicants.length === 0
			? emptyRow
			: applicants.map(applicantRow).join("\n");

	const tableOrEmpty = `<div class="overflow-x-auto">
				<table class="w-full text-left border-collapse">
					<thead>
						<tr class="border-b-2 border-cream-300 bg-cream-100">
							<th class="th">Name</th>
							<th class="th">Phone</th>
							<th class="th">Email</th>
							<th class="th">Added</th>
						</tr>
					</thead>
					<tbody id="applicant-rows">
						${rows}
					</tbody>
				</table>
			</div>`;

	const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"search": ""}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Applicants</h1>
		</div>
		<button
			class="btn btn-primary"
			data-on:click="@get('/applicants/new')">
			Add Applicant
		</button>
	</div>

	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by name or phone&hellip;"
			data-bind:search
			class="input max-w-sm bg-white text-sm placeholder-bark-muted" />
	</div>

	<div class="card">
		${tableOrEmpty}
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Applicants", body);
}
