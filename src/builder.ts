import type { AbilityDefinition, Cost, TargetingMode } from "./definition";
import type { Effect, InstantEffect } from "./effect";
import { TimelineWriter } from "./timeline";
import { assertNonNegative, assertPositive } from "./validation";

interface Draft {
	readonly name: string;
	readonly description: string;
	readonly cooldown: number;
	readonly windup: number;
	readonly targeting: TargetingMode;
	readonly range: number | undefined;
	readonly costs: ReadonlyArray<Cost>;
	readonly onActivate: ReadonlyArray<InstantEffect>;
	readonly steps: ReadonlyArray<Effect>;
	readonly onHit: ReadonlyArray<InstantEffect>;
}

function checkHitEffects(name: string, effects: ReadonlyArray<InstantEffect>): void {
	for (const effect of effects) {
		const nested = effect.hitEffects;
		if (nested === undefined) {
			continue;
		} else if (nested.isEmpty()) {
			// falling back to onHit from inside onHit would loop forever
			throw `${name}: ${effect.name} inside hit effects needs effects of its own`;
		}
		checkHitEffects(name, nested);
	}
}

function compile(draft: Draft): AbilityDefinition {
	const { name, targeting, onHit } = draft;

	const timeline = new TimelineWriter();
	for (const effect of draft.onActivate) {
		timeline.schedule(effect, 0);
	}
	let duration = draft.windup;
	for (const effect of draft.steps) {
		timeline.schedule(effect, duration);
		duration += effect.duration;
	}
	const steps = timeline.finish();

	const subjectless = targeting === "point" || targeting === "direction";
	let effectCount = 0;
	let usesOnHit = false;

	for (const step of steps) {
		if (step.kind !== "effect") {
			continue;
		}
		effectCount += 1;

		const effect = step.effect;
		if (subjectless && effect.appliesTo === "subject") {
			throw `${name}: ${effect.name} needs a subject and ${targeting} targeting has none, wrap it in area() or projectile()`;
		}

		const hitEffects = effect.hitEffects;
		if (hitEffects !== undefined) {
			if (hitEffects.isEmpty()) {
				if (onHit.isEmpty()) {
					throw `${name}: ${effect.name} has nothing to apply on hit, give it effects or call onHit`;
				}
				usesOnHit = true;
			}
			checkHitEffects(name, hitEffects);
		}
	}

	if (effectCount === 0) {
		throw `${name}: the timeline only waits, it has no effects`;
	} else if (!onHit.isEmpty() && !usesOnHit) {
		throw `${name}: onHit is never used, every projectile and area has its own effects`;
	}
	checkHitEffects(name, onHit);

	return table.freeze({
		name,
		description: draft.description,
		cooldown: draft.cooldown,
		windup: draft.windup,
		duration,
		targeting,
		range: draft.range,
		costs: table.freeze([...draft.costs]),
		steps: table.freeze(steps),
		onHit: table.freeze([...onHit]),
	});
}

export class AbilityBuilder<HasCooldown extends boolean = false, HasSteps extends boolean = false> {
	declare private readonly state: [HasCooldown, HasSteps];

	private constructor(private readonly draft: Draft) {}

	public static named(name: string): AbilityBuilder {
		if (name === "") {
			throw "abilities need a name";
		}
		return new AbilityBuilder({
			name,
			description: "",
			cooldown: 0,
			windup: 0,
			targeting: "self",
			range: undefined,
			costs: [],
			onActivate: [],
			steps: [],
			onHit: [],
		});
	}

	public describe(description: string): AbilityBuilder<HasCooldown, HasSteps> {
		return this.with({ description });
	}

	public cost(resource: string, amount: number): AbilityBuilder<HasCooldown, HasSteps> {
		const { name, costs } = this.draft;
		if (resource === "") {
			throw `${name}: costs need a resource name`;
		}
		assertPositive(`${name}: ${resource} cost`, amount);
		for (const cost of costs) {
			if (cost.resource === resource) {
				throw `${name}: ${resource} cost is set twice`;
			}
		}
		return this.with({ costs: [...costs, { resource, amount }] });
	}

	public cooldown(seconds: number): AbilityBuilder<true, HasSteps> {
		assertNonNegative(`${this.draft.name}: cooldown`, seconds);
		return this.with<true, HasSteps>({ cooldown: seconds });
	}

	public windup(seconds: number): AbilityBuilder<HasCooldown, HasSteps> {
		assertNonNegative(`${this.draft.name}: windup`, seconds);
		return this.with({ windup: seconds });
	}

	public targeting(mode: TargetingMode, range?: number): AbilityBuilder<HasCooldown, HasSteps> {
		const name = this.draft.name;
		if (range !== undefined) {
			if (mode !== "point" && mode !== "target") {
				throw `${name}: range only applies to point or target targeting, not ${mode}`;
			}
			assertPositive(`${name}: range`, range);
		}
		// not this.with(): spreading { range: undefined } copies nothing in Luau, the old range would stick
		return new AbilityBuilder<HasCooldown, HasSteps>({ ...this.draft, targeting: mode, range });
	}

	public onActivate(...effects: InstantEffect[]): AbilityBuilder<HasCooldown, HasSteps> {
		return this.with({ onActivate: [...this.draft.onActivate, ...effects] });
	}

	public then(effect: Effect): AbilityBuilder<HasCooldown, true> {
		return this.with<HasCooldown, true>({ steps: [...this.draft.steps, effect] });
	}

	public onHit(...effects: InstantEffect[]): AbilityBuilder<HasCooldown, HasSteps> {
		if (effects.isEmpty()) {
			throw `${this.draft.name}: onHit needs at least one effect`;
		}
		return this.with({ onHit: [...this.draft.onHit, ...effects] });
	}

	public build(this: AbilityBuilder<true, true>): AbilityDefinition {
		return compile(this.draft);
	}

	private with<C extends boolean = HasCooldown, S extends boolean = HasSteps>(
		changes: Partial<Draft>,
	): AbilityBuilder<C, S> {
		return new AbilityBuilder<C, S>({ ...this.draft, ...changes });
	}
}

export function ability(name: string): AbilityBuilder {
	return AbilityBuilder.named(name);
}
