import type { Effect, InstantEffect, Predicate, Timeline } from "./effect";

export interface Gate {
	readonly predicate: Predicate;
}

export interface EffectStep {
	readonly kind: "effect";
	readonly time: number;
	readonly gate: Gate | undefined;
	readonly effect: InstantEffect;
}

export interface GateStep {
	readonly kind: "gate";
	readonly time: number;
	readonly gate: Gate | undefined;
	readonly opens: Gate;
}

export type TimelineStep = EffectStep | GateStep;

interface Entry {
	readonly step: TimelineStep;
	readonly order: number;
}

export class TimelineWriter implements Timeline {
	private readonly entries = new Array<Entry>();
	private current: Gate | undefined;

	public schedule(effect: Effect, start: number): void {
		effect.schedule(this, start);
	}

	public add(time: number, effect: InstantEffect): void {
		this.push({ kind: "effect", time, gate: this.current, effect });
	}

	public gate(time: number, predicate: Predicate, schedule: () => void): void {
		const opens: Gate = { predicate };
		this.push({ kind: "gate", time, gate: this.current, opens });

		const enclosing = this.current;
		this.current = opens;
		schedule();
		this.current = enclosing;
	}

	public finish(): TimelineStep[] {
		// table.sort isn't stable, ties fall back to scheduling order so a gate always runs before its children
		const entries = [...this.entries];
		entries.sort((a, b) => a.step.time < b.step.time || (a.step.time === b.step.time && a.order < b.order));
		return entries.map((entry) => entry.step);
	}

	private push(step: TimelineStep): void {
		this.entries.push({ step, order: this.entries.size() });
	}
}
