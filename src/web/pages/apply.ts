function publicLayout(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CSF - ${escapeHtml(title)}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
	<link rel="stylesheet" href="/styles/app.css">
	<style>
		body { background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E"); }
	</style>
</head>
<body class="font-body bg-cream-100 text-bark min-h-screen flex items-center justify-center p-4">
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

const inputClass =
	"w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";

export function applyPage(): string {
	return publicLayout(
		"Apply",
		`<div class="w-full max-w-md">
	<div class="bg-white rounded-xl border border-cream-200 shadow-sm p-8">
		<h1 class="font-heading text-2xl font-bold text-bark mb-6 text-center">Apply for Assistance</h1>
		<form action="/apply" method="POST" class="space-y-4">
			<div>
				<label for="name" class="block text-sm font-body text-bark mb-1">Name</label>
				<input type="text" id="name" name="name" required class="${inputClass}" />
			</div>
			<div>
				<label for="phone" class="block text-sm font-body text-bark mb-1">Phone</label>
				<input type="tel" id="phone" name="phone" required class="${inputClass}" />
			</div>
			<div>
				<label for="email" class="block text-sm font-body text-bark mb-1">Email (optional)</label>
				<input type="email" id="email" name="email" class="${inputClass}" />
			</div>
			<div>
				<label for="meetingPlace" class="block text-sm font-body text-bark mb-1">Meeting Place or Address</label>
				<input type="text" id="meetingPlace" name="meetingPlace" required class="${inputClass}" />
			</div>
			<fieldset>
				<legend class="block text-sm font-body text-bark mb-2">Payment Preference</legend>
				<div class="space-y-2">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" name="paymentPreference" value="cash" checked onchange="toggleBank()" />
						<span class="text-sm text-bark">Cash</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" name="paymentPreference" value="bank" onchange="toggleBank()" />
						<span class="text-sm text-bark">Bank transfer</span>
					</label>
				</div>
			</fieldset>
			<div id="bankFields" class="space-y-4" style="display:none;">
				<div>
					<label for="bankName" class="block text-sm font-body text-bark mb-1">Bank Name</label>
					<input type="text" id="bankName" name="bankName" class="${inputClass}" />
				</div>
				<div>
					<label for="sortCode" class="block text-sm font-body text-bark mb-1">Sort Code</label>
					<input type="text" id="sortCode" name="sortCode" class="${inputClass}" />
				</div>
				<div>
					<label for="accountNumber" class="block text-sm font-body text-bark mb-1">Account Number</label>
					<input type="text" id="accountNumber" name="accountNumber" class="${inputClass}" />
				</div>
			</div>
			<button type="submit" class="w-full bg-amber hover:bg-amber-dark text-cream-50 font-body font-semibold py-2.5 px-4 rounded-md transition-colors">
				Submit Application
			</button>
		</form>
		<p class="text-xs text-bark-muted mt-4 text-center">
			Your information will be retained for 6 months and then automatically deleted.
			<a href="/privacy" class="underline hover:text-bark">Privacy Policy</a>
		</p>
	</div>
</div>
<script>
function toggleBank() {
	var bank = document.querySelector('input[name="paymentPreference"][value="bank"]');
	document.getElementById('bankFields').style.display = bank.checked ? '' : 'none';
}
</script>`,
	);
}

export function applyClosedPage(): string {
	return publicLayout(
		"Applications Closed",
		`<div class="w-full max-w-md">
	<div class="bg-white rounded-xl border border-cream-200 shadow-sm p-8 text-center">
		<h1 class="font-heading text-2xl font-bold text-bark mb-4">Applications Closed</h1>
		<p class="text-bark-muted font-body">The application window is currently closed. Please check back later.</p>
	</div>
</div>`,
	);
}

export function applyResultPage(status: string, reason?: string): string {
	let heading: string;
	let message: string;

	if (status === "accepted") {
		heading = "Application Received";
		message =
			"Your application has been added to the lottery pool. You will be contacted if selected.";
	} else if (status === "flagged") {
		heading = "Application Received";
		message =
			"Your application has been received. A volunteer will contact you for additional information.";
	} else if (status === "rejected") {
		if (reason === "window_closed") {
			heading = "Applications Closed";
			message =
				"The application window is currently closed. Please check back later.";
		} else if (reason === "cooldown") {
			heading = "Please Wait";
			message =
				"You have applied recently. Please wait before submitting a new application.";
		} else if (reason === "duplicate") {
			heading = "Duplicate Application";
			message = "You have already applied during this application window.";
		} else {
			heading = "Application Not Accepted";
			message =
				"Your application could not be accepted at this time. Please try again later.";
		}
	} else {
		heading = "Application Status";
		message = "Your application has been processed.";
	}

	return publicLayout(
		heading,
		`<div class="w-full max-w-md">
	<div class="bg-white rounded-xl border border-cream-200 shadow-sm p-8 text-center">
		<h1 class="font-heading text-2xl font-bold text-bark mb-4">${escapeHtml(heading)}</h1>
		<p class="text-bark-muted font-body">${escapeHtml(message)}</p>
	</div>
</div>`,
	);
}
