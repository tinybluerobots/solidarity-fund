import type { Volunteer } from "../../domain/volunteer/types.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeSignalValue(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
  <div class="p-6">${content}</div>
  <style>@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }</style>
</div>`;
}

function field(label: string, value: string): string {
	return `<div class="mb-4">
    <dt class="text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">${label}</dt>
    <dd class="font-body text-bark">${escapeHtml(value)}</dd>
  </div>`;
}

const inputClass =
	"w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";
const btnAmber =
	"px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnSecondary =
	"px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";

export function viewPanel(v: Volunteer, currentVolunteerId: string): string {
	const phoneField = v.phone ? field("Phone", v.phone) : "";
	const emailField = v.email ? field("Email", v.email) : "";
	const isSelf = v.id === currentVolunteerId;

	const deleteButton = isSelf
		? ""
		: `<button class="${btnSecondary}" data-show="!$confirmDelete" data-on-click="$confirmDelete = true">Delete</button>
      <span data-show="$confirmDelete" class="flex items-center gap-2" style="display:none">
        <span class="font-body text-bark-muted text-sm">Are you sure?</span>
        <button class="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors" data-on-click="@delete('/volunteers/${v.id}')">Confirm</button>
        <button class="${btnSecondary}" data-on-click="$confirmDelete = false">Cancel</button>
      </span>`;

	return panelWrapper(`
    <div class="flex items-center justify-between mb-6" data-signals="{confirmDelete: false}">
      <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(v.name)}</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
    <dl>
      ${phoneField}
      ${emailField}
      ${field("Role", v.isAdmin ? "Admin" : "Volunteer")}
    </dl>
    <div class="flex gap-3 mt-6">
      <button class="${btnAmber}" data-on-click="@get('/volunteers/${v.id}/edit')">Edit</button>
      ${deleteButton}
    </div>
  `);
}

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
	showAdminCheckbox: boolean;
	cancelAction: string;
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
          <input class="${inputClass}" type="tel" data-bind-phone />
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
        ${
					opts.showAdminCheckbox
						? `<div class="mb-6">
          <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
            <input type="checkbox" data-bind-is-admin />
            Admin
          </label>
        </div>`
						: `<div class="mb-6">
          <p class="text-xs text-bark-muted">${opts.isAdmin ? "Admin" : "Volunteer"} — admin status can only be set at creation</p>
        </div>`
				}
        <div class="flex gap-3">
          <button type="submit" class="${btnAmber}">${opts.submitLabel}</button>
          <button type="button" class="${btnSecondary}" data-on-click="${opts.cancelAction}">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

export function editPanel(v: Volunteer, _currentVolunteerId: string): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Volunteer</h2>
      <button class="${btnSecondary}" data-on-click="@get('/volunteers/close')">Close</button>
    </div>
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
			showAdminCheckbox: false,
			cancelAction: `@get('/volunteers/${v.id}')`,
		})}
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
			showAdminCheckbox: true,
			cancelAction: "@get('/volunteers/close')",
		})}
  `);
}
