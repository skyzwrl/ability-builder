export interface Resources {
	get(resource: string): number;
	set(resource: string, amount: number): void;
}

export class ResourcePool implements Resources {
	private readonly amounts = new Map<string, number>();

	public constructor(initial: Readonly<Record<string, number>> = {}) {
		for (const [resource, amount] of pairs(initial)) {
			this.amounts.set(resource, amount);
		}
	}

	public get(resource: string): number {
		return this.amounts.get(resource) ?? 0;
	}

	public set(resource: string, amount: number): void {
		this.amounts.set(resource, amount);
	}
}
