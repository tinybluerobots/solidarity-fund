import type { Volunteer } from "../../domain/volunteer/types.ts";

function escapeSignalValue(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
  <div class="p-6">${content}</div>
  <style>@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }</style>
</div>`;
}

const inputClass =
	"w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";
const btnAmber =
	"px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnSecondary =
	"px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";

function volunteerForm(opts: {
	action: string;
	method: "@put" | "@post";
	submitLabel: string;
	name: string;
	phone: string;
	email: string;
	password: string;
	isAdmin: boolean;
	passwordRequired: boolean;
	passwordHint?: string;
	disableAction?: string;
	enableAction?: string;
}): string {
	const passwordRequired = opts.passwordRequired ? "required" : "";
	const hintHtml = opts.passwordHint
		? `<p class="text-xs text-bark-muted mt-1">${opts.passwordHint}</p>`
		: "";
	return `
    <div data-signals="{name: '${escapeSignalValue(opts.name)}', phone: '${escapeSignalValue(opts.phone)}', email: '${escapeSignalValue(opts.email)}', password: '', isAdmin: ${opts.isAdmin}}">
      <form data-on-submit__prevent="${opts.method}('${opts.action}')">
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Name</label>
          <input class="${inputClass}" type="text" data-bind-name required />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Phone</label>
          <input class="${inputClass}" type="tel" data-bind-phone pattern="[0-9]*" inputmode="numeric" />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Email</label>
          <input class="${inputClass}" type="email" data-bind-email />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Password</label>
          <input class="${inputClass}" type="password" data-bind-password ${passwordRequired} />
          ${hintHtml}
        </div>
        <div class="mb-6">
          <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
            <input type="checkbox" data-bind-is-admin />
            Admin
          </label>
        </div>
        <div class="flex gap-3" data-signals="{confirmDisable: false}">
          <button type="submit" class="${btnAmber}">${opts.submitLabel}</button>
          ${
						opts.enableAction
							? `<button type="button" class="${btnSecondary} ml-auto" data-on-click="${opts.enableAction}">Enable</button>`
							: opts.disableAction
								? `<button type="button" class="${btnSecondary} ml-auto" data-show="!$confirmDisable" data-on-click="$confirmDisable = true">Disable</button>
          <span data-show="$confirmDisable" class="flex items-center gap-2 ml-auto" style="display:none">
            <span class="font-body text-bark-muted text-sm">Sure?</span>
            <button type="button" class="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors" data-on-click="${opts.disableAction}">Confirm</button>
            <button type="button" class="${btnSecondary}" data-on-click="$confirmDisable = false">No</button>
          </span>`
								: ""
					}
        </div>
      </form>
    </div>
  `;
}

export function editPanel(v: Volunteer, currentVolunteerId: string): string {
	const isSelf = v.id === currentVolunteerId;

	return panelWrapper(`
    <div data-signals="{activeTab: 'details', historyLoaded: false}">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Volunteer</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
    <div class="flex gap-1 mb-4 border-b border-cream-200">
      <button type="button"
        class="px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 border-transparent text-bark-muted hover:text-bark"
        data-class-border-amber="$activeTab==='details'"
        data-class-text-amber="$activeTab==='details'"
        data-on-click="$activeTab='details'">Details</button>
      <button type="button"
        class="px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 border-transparent text-bark-muted hover:text-bark"
        data-class-border-amber="$activeTab==='history'"
        data-class-text-amber="$activeTab==='history'"
        data-on-click="$activeTab='history'; if(!$historyLoaded){$historyLoaded=true; @get('/volunteers/${v.id}/history')}">History</button>
    </div>
    <div data-show="$activeTab==='details'">
    ${volunteerForm({
			action: `/volunteers/${v.id}`,
			method: "@put",
			submitLabel: "Save",
			name: v.name,
			phone: v.phone ?? "",
			email: v.email ?? "",
			password: "",
			isAdmin: v.isAdmin,
			passwordRequired: false,
			passwordHint: "Leave blank to keep current",

			disableAction:
				!isSelf && !v.isDisabled
					? `@post('/volunteers/${v.id}/disable')`
					: undefined,
			enableAction:
				!isSelf && v.isDisabled
					? `@post('/volunteers/${v.id}/enable')`
					: undefined,
		})}
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
      <h2 class="font-heading font-bold text-xl text-bark">New Volunteer</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
    ${volunteerForm({
			action: "/volunteers",
			method: "@post",
			submitLabel: "Create",
			name: "",
			phone: "",
			email: "",
			password: "",
			isAdmin: false,
			passwordRequired: true,
		})}
  `);
}
