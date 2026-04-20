import type { Applicant } from "../../domain/applicant/types.ts";

function escapeSignalValue(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\n/g, "\\n")
		.replace(/<\//g, "<\\/")
		.replace(/</g, "\\u003C")
		.replace(/>/g, "\\u003E");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="panel">
  <div class="p-6">${content}</div>
</div>`;
}

function applicantForm(opts: {
	action: string;
	method: "@put" | "@post";
	submitLabel: string;
	name: string;
	phone: string;
	email: string;
	deleteAction?: string;
}): string {
	return `
    <div data-signals="{name: '${escapeSignalValue(opts.name)}', phone: '${escapeSignalValue(opts.phone)}', email: '${escapeSignalValue(opts.email)}'}">
      <form data-on:submit__prevent="${opts.method}('${opts.action}')">
        <div class="mb-4">
          <label class="label">Name</label>
          <input class="input" type="text" data-bind:name required />
        </div>
        <div class="mb-4">
          <label class="label">Phone</label>
          <input class="input" type="tel" data-bind:phone required inputmode="tel" />
        </div>
        <div class="mb-4">
          <label class="label">Email</label>
          <input class="input" type="email" data-bind:email />
        </div>
        <div class="flex gap-3" data-signals="{confirmDelete: false}">
          <button type="submit" class="btn btn-primary">${opts.submitLabel}</button>
          ${
						opts.deleteAction
							? `<button type="button" class="btn btn-secondary ml-auto" data-show="!$confirmDelete" data-on:click="$confirmDelete = true">Delete</button>
          <span data-show="$confirmDelete" class="flex items-center gap-2 ml-auto" style="display:none">
            <span class="font-body text-bark-muted text-sm">Sure?</span>
            <button type="button" class="btn btn-danger px-3 py-1" data-on:click="${opts.deleteAction}">Confirm</button>
            <button type="button" class="btn btn-secondary" data-on:click="$confirmDelete = false">No</button>
          </span>`
							: ""
					}
        </div>
      </form>
    </div>
  `;
}

export function editPanel(r: Applicant): string {
	return panelWrapper(`
    <div data-signals="{activeTab: 'details', historyLoaded: false}">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Applicant</h2>
      <button class="btn btn-secondary" data-on:click="@get('/applicants/close')">Close</button>
    </div>
    <div class="flex gap-1 mb-4 border-b border-cream-200">
      <button type="button"
        class="tab"
        data-class:border-amber="$activeTab==='details'"
        data-class:text-amber="$activeTab==='details'"
        data-on:click="$activeTab='details'">Details</button>
      <button type="button"
        class="tab"
        data-class:border-amber="$activeTab==='history'"
        data-class:text-amber="$activeTab==='history'"
        data-on:click="$activeTab='history'; if(!$historyLoaded){$historyLoaded=true; @get('/applicants/${r.id}/history')}">History</button>
    </div>
    <div data-show="$activeTab==='details'">
    ${applicantForm({
			action: `/applicants/${r.id}`,
			method: "@put",
			submitLabel: "Save",
			name: r.name,
			phone: r.phone,
			email: r.email ?? "",
			deleteAction: `@delete('/applicants/${r.id}')`,
		})}
    <div class="mt-4" data-signals="{notes: '${escapeSignalValue(r.notes ?? "")}'}">
      <label class="label">Notes</label>
      <textarea class="input" rows="3" data-bind:notes
        data-on:blur="@post('/applicants/${r.id}/notes')"></textarea>
    </div>
    </div>
    <div data-show="$activeTab==='history'" style="display:none">
      <div id="history-content" class="py-8 text-center text-bark-muted text-sm">Loading...</div>
    </div>
    </div>
  `);
}

export function createPanel(): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">New Applicant</h2>
      <button class="btn btn-secondary" data-on:click="@get('/applicants/close')">Close</button>
    </div>
    ${applicantForm({
			action: "/applicants",
			method: "@post",
			submitLabel: "Create",
			name: "",
			phone: "",
			email: "",
		})}
  `);
}
