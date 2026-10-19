export function assertPositive(what: string, value: number): void {
	if (!(value > 0 && value < math.huge)) {
		throw `${what} must be a positive number (got ${value})`;
	}
}

export function assertNonNegative(what: string, value: number): void {
	if (!(value >= 0 && value < math.huge)) {
		throw `${what} must be zero or more (got ${value})`;
	}
}

export function assertWhole(what: string, value: number, minimum: number): void {
	if (!(value >= minimum && value < math.huge && value % 1 === 0)) {
		throw `${what} must be a whole number of at least ${minimum} (got ${value})`;
	}
}
