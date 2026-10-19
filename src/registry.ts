import type { AbilityDefinition, Cost, TargetingMode } from "./definition";

// plain data only, safe to send to clients for ability bars and tooltips
export interface AbilitySummary {
	readonly name: string;
	readonly description: string;
	readonly cooldown: number;
	readonly windup: number;
	readonly duration: number;
	readonly targeting: TargetingMode;
	readonly range: number | undefined;
	readonly costs: ReadonlyArray<Cost>;
}

function summarize(definition: AbilityDefinition): AbilitySummary {
	const costs = new Array<Cost>();
	for (const cost of definition.costs) {
		costs.push({ resource: cost.resource, amount: cost.amount });
	}
	return {
		name: definition.name,
		description: definition.description,
		cooldown: definition.cooldown,
		windup: definition.windup,
		duration: definition.duration,
		targeting: definition.targeting,
		range: definition.range,
		costs,
	};
}

export class AbilityRegistry {
	private readonly definitions = new Map<string, AbilityDefinition>();

	public register(...definitions: AbilityDefinition[]): void {
		const incoming = new Set<string>();
		for (const definition of definitions) {
			if (this.definitions.has(definition.name) || incoming.has(definition.name)) {
				throw `ability ${definition.name} is already registered`;
			}
			incoming.add(definition.name);
		}
		for (const definition of definitions) {
			this.definitions.set(definition.name, definition);
		}
	}

	public get(name: string): AbilityDefinition | undefined {
		return this.definitions.get(name);
	}

	public has(name: string): boolean {
		return this.definitions.has(name);
	}

	public summary(name: string): AbilitySummary | undefined {
		const definition = this.definitions.get(name);
		return definition ? summarize(definition) : undefined;
	}

	public summaries(): AbilitySummary[] {
		const summaries = new Array<AbilitySummary>();
		for (const [, definition] of this.definitions) {
			summaries.push(summarize(definition));
		}
		summaries.sort((a, b) => a.name < b.name);
		return summaries;
	}
}
