import type { AbilityDefinition } from "./definition";
import type { AbilityHost } from "./host";

export interface EffectContext {
	readonly ability: AbilityDefinition;
	readonly host: AbilityHost;
	readonly caster: Model;
	/** the caster's position during the cast, the hit position inside hit effects */
	readonly origin: Vector3;
	readonly direction: Vector3;
	readonly point: Vector3 | undefined;
	readonly target: Model | undefined;
	readonly elapsed: number;
	readonly source: "cast" | "hit";
}

export type Predicate = (context: EffectContext) => boolean;

export interface Timeline {
	add(time: number, effect: InstantEffect): void;
	gate(time: number, predicate: Predicate, schedule: () => void): void;
}

export interface Effect {
	readonly name: string;
	readonly duration: number;
	readonly schedule: (timeline: Timeline, start: number) => void;
}

export interface InstantEffect extends Effect {
	readonly appliesTo: "caster" | "subject";
	/** set on effects that produce hits (projectile, area); empty means fall back to the ability's onHit */
	readonly hitEffects?: ReadonlyArray<InstantEffect>;
	readonly run: (context: EffectContext, subject: Model) => void;
}

export function instant(fields: Pick<InstantEffect, "name" | "appliesTo" | "run" | "hitEffects">): InstantEffect {
	const result: InstantEffect = {
		...fields,
		duration: 0,
		schedule: (timeline, start) => timeline.add(start, result),
	};
	return result;
}

export function effect(
	name: string,
	run: (context: EffectContext, subject: Model) => void,
	appliesTo: "caster" | "subject" = "subject",
): InstantEffect {
	return instant({ name, appliesTo, run });
}

export function applyHit(
	context: EffectContext,
	subject: Model,
	position: Vector3,
	effects: ReadonlyArray<InstantEffect>,
): void {
	const hit: EffectContext = { ...context, origin: position, source: "hit" };
	for (const hitEffect of effects) {
		hitEffect.run(hit, hitEffect.appliesTo === "caster" ? context.caster : subject);
	}
}
