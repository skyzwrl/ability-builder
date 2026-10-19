import type { AreaShape, ProjectileRequest } from "./effects/hits";

export interface AbilityHost {
	getPivot(entity: Model): CFrame;
	damage(target: Model, amount: number, damageType: string, source: Model): void;
	heal(target: Model, amount: number, source: Model): void;
	addVelocity(entity: Model, velocity: Vector3): void;
	applyStatus(target: Model, status: string, duration: number, source: Model): void;
	spawnProjectile(request: ProjectileRequest): void;
	queryArea(shape: AreaShape, frame: CFrame, caster: Model): ReadonlyArray<Model>;
}
