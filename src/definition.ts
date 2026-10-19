import type { InstantEffect } from "./effect";
import type { TimelineStep } from "./timeline";

export type TargetingMode = "self" | "point" | "direction" | "target";

export interface Cost {
	readonly resource: string;
	readonly amount: number;
}

export interface AbilityDefinition {
	readonly name: string;
	readonly description: string;
	readonly cooldown: number;
	readonly windup: number;
	readonly duration: number;
	readonly targeting: TargetingMode;
	readonly range: number | undefined;
	readonly costs: ReadonlyArray<Cost>;
	readonly steps: ReadonlyArray<TimelineStep>;
	readonly onHit: ReadonlyArray<InstantEffect>;
}
