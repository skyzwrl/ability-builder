const MIN_LENGTH = 1e-6;

export function flatUnit(vector: Vector3): Vector3 | undefined {
	const flat = new Vector3(vector.X, 0, vector.Z);
	return flat.Magnitude > MIN_LENGTH ? flat.Unit : undefined;
}
