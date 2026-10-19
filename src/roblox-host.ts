import { Workspace } from "@rbxts/services";
import type { AreaShape, ProjectileRequest } from "./effects/hits";
import type { AbilityHost } from "./host";

export interface RobloxHostOptions {
	readonly spawnProjectile?: (request: ProjectileRequest) => void;
	readonly applyStatus?: (target: Model, status: string, duration: number, source: Model) => void;
	readonly canHit?: (caster: Model, target: Model) => boolean;
	readonly addVelocity?: (entity: Model, velocity: Vector3) => void;
}

function characterOf(part: BasePart): Model | undefined {
	let model = part.FindFirstAncestorOfClass("Model");
	while (model) {
		if (model.FindFirstChildOfClass("Humanoid")) {
			return model;
		}
		model = model.FindFirstAncestorOfClass("Model");
	}
	return undefined;
}

export class RobloxHost implements AbilityHost {
	private readonly overlapParams = new OverlapParams();

	public constructor(private readonly options: RobloxHostOptions = {}) {
		this.overlapParams.FilterType = Enum.RaycastFilterType.Exclude;
	}

	public getPivot(entity: Model): CFrame {
		return entity.GetPivot();
	}

	public damage(target: Model, amount: number): void {
		target.FindFirstChildOfClass("Humanoid")?.TakeDamage(amount);
	}

	public heal(target: Model, amount: number): void {
		const humanoid = target.FindFirstChildOfClass("Humanoid");
		if (humanoid && humanoid.Health > 0) {
			humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + amount);
		}
	}

	public addVelocity(entity: Model, velocity: Vector3): void {
		if (this.options.addVelocity) {
			this.options.addVelocity(entity, velocity);
			return;
		}
		// a player's character is simulated by their client, impulses applied here are dropped,
		// pass addVelocity to forward those to the owning client
		const root = entity.PrimaryPart;
		root?.ApplyImpulse(velocity.mul(root.AssemblyMass));
	}

	public applyStatus(target: Model, status: string, duration: number, source: Model): void {
		if (!this.options.applyStatus) {
			throw `RobloxHost can't apply ${status} without an applyStatus option`;
		}
		this.options.applyStatus(target, status, duration, source);
	}

	public spawnProjectile(request: ProjectileRequest): void {
		if (!this.options.spawnProjectile) {
			throw `RobloxHost can't fire ${request.ability}'s projectile without a spawnProjectile option`;
		}
		this.options.spawnProjectile(request);
	}

	public queryArea(shape: AreaShape, frame: CFrame, caster: Model): ReadonlyArray<Model> {
		this.overlapParams.FilterDescendantsInstances = [caster];
		const parts =
			shape.kind === "sphere"
				? Workspace.GetPartBoundsInRadius(frame.Position, shape.radius, this.overlapParams)
				: Workspace.GetPartBoundsInBox(frame, shape.size, this.overlapParams);

		const canHit = this.options.canHit;
		const models = new Array<Model>();
		const seen = new Set<Model>();
		for (const part of parts) {
			const model = characterOf(part);
			if (model && !seen.has(model)) {
				seen.add(model);
				if (!canHit || canHit(caster, model)) {
					models.push(model);
				}
			}
		}
		return models;
	}
}
