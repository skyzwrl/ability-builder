import { effect, type AbilityHost, type AreaShape, type InstantEffect, type ProjectileRequest } from "..";

export interface AreaQuery {
	readonly shape: AreaShape;
	readonly frame: CFrame;
	readonly caster: Model;
}

export class FakeHost implements AbilityHost {
	public readonly log = new Array<string>();
	public readonly velocities = new Array<Vector3>();
	public readonly projectiles = new Array<ProjectileRequest>();
	public readonly queries = new Array<AreaQuery>();
	public areaResult = new Array<Model>();
	private readonly pivots = new Map<Model, CFrame>();

	public spawn(name: string, pivot = new CFrame()): Model {
		const model = new Instance("Model");
		model.Name = name;
		this.pivots.set(model, pivot);
		return model;
	}

	public getPivot(entity: Model): CFrame {
		return this.pivots.get(entity) ?? new CFrame();
	}

	public damage(target: Model, amount: number, damageType: string, source: Model): void {
		this.log.push(`damage ${target.Name} ${amount} ${damageType} by ${source.Name}`);
	}

	public heal(target: Model, amount: number, source: Model): void {
		this.log.push(`heal ${target.Name} ${amount} by ${source.Name}`);
	}

	public addVelocity(entity: Model, velocity: Vector3): void {
		this.velocities.push(velocity);
		this.log.push(`velocity ${entity.Name}`);
	}

	public applyStatus(target: Model, status: string, duration: number, source: Model): void {
		this.log.push(`status ${target.Name} ${status} ${duration} by ${source.Name}`);
	}

	public spawnProjectile(request: ProjectileRequest): void {
		this.projectiles.push(request);
		this.log.push(`projectile ${request.ability}`);
	}

	public queryArea(shape: AreaShape, frame: CFrame, caster: Model): ReadonlyArray<Model> {
		this.queries.push({ shape, frame, caster });
		return this.areaResult;
	}
}

export function mark(label: string, log: string[]): InstantEffect {
	return effect(label, () => log.push(label), "caster");
}

export function stamp(label: string, times: number[]): InstantEffect {
	return effect(label, (context) => times.push(context.elapsed), "caster");
}

export function round(value: number): number {
	return math.round(value * 1000) / 1000;
}

export function near(a: Vector3, b: Vector3): boolean {
	return a.sub(b).Magnitude < 1e-4;
}
