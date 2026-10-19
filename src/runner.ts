import type { AbilityDefinition } from "./definition";
import type { EffectContext } from "./effect";
import type { AbilityHost } from "./host";
import type { Resources } from "./resources";
import type { Gate, TimelineStep } from "./timeline";

export interface ActivationParams {
	readonly target?: Model;
	readonly point?: Vector3;
	readonly direction?: Vector3;
}

export type ActivationFailure = "busy" | "onCooldown" | "missingTarget" | "outOfRange" | "cannotAfford";

interface Activation {
	readonly definition: AbilityDefinition;
	readonly params: ActivationParams;
	readonly startedAt: number;
	readonly openGates: Set<Gate>;
	elapsed: number;
	cursor: number;
	committed: boolean;
}

// summed dts drift, a step at 1 still has to fire on the update that leaves elapsed at 0.9999999999999999
const EPSILON = 1e-9;

export class AbilityRunner {
	private clock = 0;
	private active: Activation | undefined;
	private readonly readyAt = new Map<string, number>();

	public constructor(
		private readonly host: AbilityHost,
		private readonly caster: Model,
		private readonly resources?: Resources,
	) {}

	public canActivate(definition: AbilityDefinition, params: ActivationParams = {}): ActivationFailure | undefined {
		if (this.active) {
			return "busy";
		} else if (this.cooldownRemaining(definition.name) > 0) {
			return "onCooldown";
		}

		const targetingFailure = this.checkTargeting(definition, params);
		if (targetingFailure !== undefined) {
			return targetingFailure;
		}
		return this.canAfford(definition) ? undefined : "cannotAfford";
	}

	public activate(definition: AbilityDefinition, params: ActivationParams = {}): ActivationFailure | "activated" {
		const failure = this.canActivate(definition, params);
		if (failure !== undefined) {
			return failure;
		}

		this.charge(definition, 1);
		const activation: Activation = {
			definition,
			params,
			startedAt: this.clock,
			openGates: new Set(),
			elapsed: 0,
			cursor: 0,
			committed: false,
		};
		this.active = activation;
		this.advance(activation);
		return "activated";
	}

	public update(dt: number): void {
		this.clock += dt;
		const activation = this.active;
		if (activation) {
			activation.elapsed += dt;
			this.advance(activation);
		}
	}

	// cancelling during the windup refunds the costs and skips the cooldown, after that both stick
	public cancel(): boolean {
		const activation = this.active;
		if (!activation) {
			return false;
		}
		this.active = undefined;
		if (!activation.committed) {
			this.charge(activation.definition, -1);
		}
		return true;
	}

	public isBusy(): boolean {
		return this.active !== undefined;
	}

	public getActive(): AbilityDefinition | undefined {
		return this.active?.definition;
	}

	public cooldownRemaining(name: string): number {
		const readyAt = this.readyAt.get(name);
		if (readyAt === undefined) {
			return 0;
		}
		const remaining = readyAt - this.clock;
		return remaining > EPSILON ? remaining : 0;
	}

	public resetCooldown(name: string): void {
		this.readyAt.delete(name);
	}

	private advance(activation: Activation): void {
		const definition = activation.definition;
		const steps = definition.steps;

		// effects can cancel or start another activation, so recheck which one is active every step
		while (this.active === activation) {
			if (!activation.committed && activation.elapsed + EPSILON >= definition.windup) {
				activation.committed = true;
				// counted from activation rather than from the update that noticed, a long frame can't stretch it
				this.readyAt.set(definition.name, activation.startedAt + definition.windup + definition.cooldown);
			}

			if (activation.cursor >= steps.size()) {
				break;
			}
			const step = steps[activation.cursor];
			if (step.time > activation.elapsed + EPSILON) {
				break;
			}
			activation.cursor += 1;
			this.run(activation, step);
		}

		if (
			this.active === activation &&
			activation.cursor >= steps.size() &&
			activation.elapsed + EPSILON >= definition.duration
		) {
			this.active = undefined;
		}
	}

	private run(activation: Activation, step: TimelineStep): void {
		if (step.gate !== undefined && !activation.openGates.has(step.gate)) {
			return;
		}

		const context = this.contextFor(activation);
		if (step.kind === "gate") {
			if (step.opens.predicate(context)) {
				activation.openGates.add(step.opens);
			}
		} else {
			const effect = step.effect;
			effect.run(
				context,
				effect.appliesTo === "caster" ? this.caster : (activation.params.target ?? this.caster),
			);
		}
	}

	private contextFor(activation: Activation): EffectContext {
		const params = activation.params;
		const pivot = this.host.getPivot(this.caster);
		return {
			ability: activation.definition,
			host: this.host,
			caster: this.caster,
			origin: pivot.Position,
			direction: this.aim(params, pivot),
			point: params.point,
			target: params.target,
			elapsed: activation.elapsed,
			source: "cast",
		};
	}

	private aim(params: ActivationParams, pivot: CFrame): Vector3 {
		if (params.direction) {
			return params.direction.Unit;
		}

		let toward = params.point;
		if (!toward && params.target) {
			toward = this.host.getPivot(params.target).Position;
		}
		if (toward) {
			const offset = toward.sub(pivot.Position);
			if (offset.Magnitude > EPSILON) {
				return offset.Unit;
			}
		}
		return pivot.LookVector;
	}

	private checkTargeting(definition: AbilityDefinition, params: ActivationParams): ActivationFailure | undefined {
		let aimedAt: Vector3;
		switch (definition.targeting) {
			case "self":
				return undefined;
			case "direction":
				return params.direction && params.direction.Magnitude > EPSILON ? undefined : "missingTarget";
			case "point":
				if (!params.point) {
					return "missingTarget";
				}
				aimedAt = params.point;
				break;
			case "target":
				if (!params.target) {
					return "missingTarget";
				}
				aimedAt = this.host.getPivot(params.target).Position;
				break;
		}

		const range = definition.range;
		if (range !== undefined && aimedAt.sub(this.host.getPivot(this.caster).Position).Magnitude > range) {
			return "outOfRange";
		}
		return undefined;
	}

	private canAfford(definition: AbilityDefinition): boolean {
		if (definition.costs.isEmpty()) {
			return true;
		}
		const resources = this.resourcesFor(definition);
		for (const cost of definition.costs) {
			if (resources.get(cost.resource) < cost.amount) {
				return false;
			}
		}
		return true;
	}

	private charge(definition: AbilityDefinition, sign: 1 | -1): void {
		if (definition.costs.isEmpty()) {
			return;
		}
		const resources = this.resourcesFor(definition);
		for (const cost of definition.costs) {
			resources.set(cost.resource, resources.get(cost.resource) - sign * cost.amount);
		}
	}

	private resourcesFor(definition: AbilityDefinition): Resources {
		if (!this.resources) {
			throw `${definition.name} has costs but this runner was created without resources`;
		}
		return this.resources;
	}
}
