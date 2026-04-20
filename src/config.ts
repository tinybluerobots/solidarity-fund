let _fundName = "Community Solidarity Fund";
let _grantAmount = "£40";

/** @internal - mutating this in tests requires resetting via setFundName() */
export function setFundName(name: string): void {
	_fundName = name;
}

export function resetFundName(): void {
	_fundName = "Community Solidarity Fund";
}

export function getFundName(): string {
	return _fundName;
}

/** @internal - mutating this in tests requires resetting via setGrantAmount() */
export function setGrantAmount(amount: string): void {
	_grantAmount = amount;
}

export function resetGrantAmount(): void {
	_grantAmount = "£40";
}

export function getGrantAmount(): string {
	return _grantAmount;
}
