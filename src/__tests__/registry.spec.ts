/// <reference types="@rbxts/testez/globals" />

import { ability, AbilityRegistry, damage, heal } from "..";

export = () => {
	const fireball = ability("Fireball")
		.describe("hurls a ball of fire")
		.cost("mana", 20)
		.cooldown(4)
		.windup(0.3)
		.then(damage(25, "fire"))
		.build();
	const mend = ability("Mend").targeting("target", 40).cooldown(8).then(heal(30)).build();

	describe("AbilityRegistry", () => {
		it("looks definitions up by name", () => {
			const registry = new AbilityRegistry();
			registry.register(fireball, mend);

			expect(registry.get("Fireball")).to.equal(fireball);
			expect(registry.has("Mend")).to.equal(true);
			expect(registry.get("Missing")).never.to.be.ok();
		});

		it("refuses duplicate names without registering any of the batch", () => {
			const registry = new AbilityRegistry();
			registry.register(fireball);

			expect(() => registry.register(mend, fireball)).to.throw("ability Fireball is already registered");
			expect(registry.has("Mend")).to.equal(false);
			expect(() => new AbilityRegistry().register(mend, mend)).to.throw("ability Mend is already registered");
		});

		it("summarizes definitions as plain data sorted by name", () => {
			const registry = new AbilityRegistry();
			registry.register(mend, fireball);

			const summaries = registry.summaries();
			expect(summaries.map((summary) => summary.name).join(",")).to.equal("Fireball,Mend");

			const [first, second] = summaries;
			expect(first.description).to.equal("hurls a ball of fire");
			expect(first.cooldown).to.equal(4);
			expect(first.windup).to.equal(0.3);
			expect(first.duration).to.equal(0.3);
			expect(first.costs[0].resource).to.equal("mana");
			expect(first.costs[0].amount).to.equal(20);
			expect(table.isfrozen(first.costs)).to.equal(false);
			expect(second.targeting).to.equal("target");
			expect(second.range).to.equal(40);

			expect(registry.summary("Mend")?.cooldown).to.equal(8);
			expect(registry.summary("Missing")).never.to.be.ok();
		});
	});
};
