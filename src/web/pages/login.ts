export function loginPage(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CSF - Login</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
	<script type="module" src="https://cdn.jsdelivr.net/npm/@starfederation/datastar@1/bundles/datastar.js"></script>
	<style>
		*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

		body {
			font-family: 'Source Serif 4', Georgia, serif;
			background-color: #f5f0e8;
			color: #2c2416;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 1rem;
			background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E");
		}

		.login-card {
			background: #fffdf8;
			border: 1px solid #e0d6c4;
			border-radius: 12px;
			padding: 2.5rem 2rem;
			width: 100%;
			max-width: 400px;
			box-shadow: 0 2px 12px rgba(44, 36, 22, 0.08);
			animation: fadeIn 0.4s ease-out;
		}

		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(8px); }
			to { opacity: 1; transform: translateY(0); }
		}

		@keyframes shake {
			0%, 100% { transform: translateX(0); }
			20%, 60% { transform: translateX(-6px); }
			40%, 80% { transform: translateX(6px); }
		}

		.login-card h1 {
			font-family: 'Fraunces', Georgia, serif;
			font-weight: 700;
			font-size: 1.75rem;
			color: #2c2416;
			margin-bottom: 0.25rem;
		}

		.login-card .subtitle {
			color: #7a6e5d;
			font-size: 0.95rem;
			margin-bottom: 2rem;
		}

		label {
			display: block;
			font-size: 0.875rem;
			font-weight: 600;
			color: #4a3f30;
			margin-bottom: 0.375rem;
		}

		input[type="text"],
		input[type="password"] {
			width: 100%;
			padding: 0.625rem 0.75rem;
			border: 1px solid #d4c9b4;
			border-radius: 6px;
			font-family: inherit;
			font-size: 1rem;
			color: #2c2416;
			background: #fffdf8;
			transition: border-color 0.2s, box-shadow 0.2s;
			margin-bottom: 1.25rem;
		}

		input:focus {
			outline: none;
			border-color: #c8943e;
			box-shadow: 0 0 0 3px rgba(200, 148, 62, 0.15);
		}

		button[type="submit"] {
			width: 100%;
			padding: 0.75rem;
			background: #c8943e;
			color: #fffdf8;
			border: none;
			border-radius: 6px;
			font-family: 'Fraunces', Georgia, serif;
			font-weight: 600;
			font-size: 1rem;
			cursor: pointer;
			transition: background-color 0.2s;
		}

		button[type="submit"]:hover {
			background: #b07f2f;
		}

		button[type="submit"]:active {
			background: #966b24;
		}

		#error-message {
			background: #fdf2f2;
			border: 1px solid #e8c4c4;
			color: #8b3a3a;
			padding: 0.625rem 0.75rem;
			border-radius: 6px;
			font-size: 0.875rem;
			margin-bottom: 1.25rem;
			animation: shake 0.4s ease-out;
		}
	</style>
</head>
<body>
	<div class="login-card"
		data-signals="{name: '', password: '', error: ''}"
	>
		<h1>Community Support Fund</h1>
		<p class="subtitle">Volunteer Portal</p>

		<form
			data-on-submit__prevent="$$post('/login')"
		>
			<div id="error-container"></div>

			<label for="name">Name</label>
			<input
				type="text"
				id="name"
				name="name"
				data-bind="name"
				autocomplete="username"
				required
			>

			<label for="password">Password</label>
			<input
				type="password"
				id="password"
				name="password"
				data-bind="password"
				autocomplete="current-password"
				required
			>

			<button type="submit">Sign In</button>
		</form>
	</div>
</body>
</html>`;
}
