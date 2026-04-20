/**
 * Strips all non-digit characters from a phone number.
 *
 * "+44 7777 777777" → "447777777777"
 * "07777 777777"      → "07777777777"
 * "(020) 7946-0958"   → "02079460958"
 */
export function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, "");
}

/**
 * Validates that a phone number contains enough digits to be plausible.
 * Accepts any format (spaces, dashes, +, parens) as long as
 * the digit count is reasonable (7–15 digits per E.164).
 */
export function isValidPhone(phone: string): boolean {
	const digits = phone.replace(/\D/g, "");
	return digits.length >= 7 && digits.length <= 15;
}