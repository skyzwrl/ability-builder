/// <reference types="@rbxts/testez/globals" />

import {
	ability,
	applyStatus,
	area,
	box,
	damage,
	dash,
	pause,
	heal,
	knockback,
	parallel,
	projectile,
	repeated,
	sequence,
	sphere,
} from "..";

export = () => {
	describe("build", () => {
		it("produces a frozen definition with the configured fields", () => {
			const fireball = ability("Fireball")
				.describe("hurls a ball of fire")
				.cost("mana", 20)
				.cooldown(4)
				.windup(0.3)
				.targeting("direction")
				.then(projectile({ speed: 120, range: 200 }))
				.onHit(damage(25, "fire"), applyStatus("burn", 3))
				.build();

			expect(fireball.name).to.equal("Fireball");
			expect(fireball.description).to.equal("hurls a ball of fire");
			expect(fireball.cooldown).to.equal(4);
			expect(fireball.windup).to.equal(0.3);
			expect(fireball.duration).to.equal(0.3);
			expect(fireball.targeting).to.equal("direction");
			expect(fireball.costs.size()).to.equal(1);
			expect(fireball.costs[0].resource).to.equal("mana");
			expect(fireball.costs[0].amount).to.equal(20);
			expect(fireball.onHit.size()).to.equal(2);

			expect(table.isfrozen(fireball)).to.equal(true);
			expect(table.isfrozen(fireball.steps)).to.equal(true);
			expect(() => {
				(fireball as unknown as { cooldown: number }).cooldown = 0;
			}).to.throw();
		});

		it("leaves the builder it came from untouched", () => {
			const base = ability("Slash").cooldown(1).cost("stamina", 10);
			const light = base.then(damage(10)).build();
			const heavy = base.windup(0.5).then(damage(30)).then(knockback(40)).build();

			expect(light.windup).to.equal(0);
			expect(light.steps.size()).to.equal(1);
			expect(heavy.windup).to.equal(0.5);
			expect(heavy.steps.size()).to.equal(2);
		});

		it("adds the windup and every step to the duration", () => {
			const definition = ability("Flurry")
				.cooldown(2)
				.windup(0.2)
				.then(damage(5))
				.then(pause(0.5))
				.then(repeated(3, 0.25, damage(1)))
				.build();

			expect(definition.duration).to.be.near(1.2);
		});

		it("clears the range when targeting changes again", () => {
			const definition = ability("Blink")
				.cooldown(3)
				.targeting("point", 40)
				.targeting("self")
				.then(dash(80))
				.build();

			expect(definition.targeting).to.equal("self");
			expect(definition.range).never.to.be.ok();
		});
	});

	describe("validation", () => {
		it("rejects negative and non-finite times", () => {
			expect(() => ability("A").cooldown(-1)).to.throw("A: cooldown must be zero or more");
			expect(() => ability("A").windup(0 / 0)).to.throw("A: windup must be zero or more");
			expect(() => ability("A").windup(math.huge)).to.throw("A: windup must be zero or more");
			expect(() => pause(0)).to.throw("pause must be a positive number");
		});

		it("rejects bad costs", () => {
			expect(() => ability("A").cost("mana", 0)).to.throw("A: mana cost must be a positive number");
			expect(() => ability("A").cost("", 5)).to.throw("A: costs need a resource name");
			expect(() => ability("A").cost("mana", 5).cost("mana", 10)).to.throw("A: mana cost is set twice");
		});

		it("only allows a range for point and target targeting", () => {
			expect(() => ability("A").targeting("self", 30)).to.throw("range only applies to point or target");
			expect(() => ability("A").targeting("direction", 30)).to.throw("range only applies to point or target");
			expect(() => ability("A").targeting("target", 0)).to.throw("A: range must be a positive number");
		});

		it("rejects effects that need a subject when the targeting has none", () => {
			expect(() => ability("A").cooldown(1).targeting("point").then(damage(5)).build()).to.throw(
				"A: damage needs a subject and point targeting has none",
			);
			expect(() =>
				ability("A").cooldown(1).targeting("direction").onActivate(heal(5)).then(dash(30)).build(),
			).to.throw("A: heal needs a subject and direction targeting has none");
		});

		it("rejects projectiles and areas with nothing to apply", () => {
			expect(() =>
				ability("A")
					.cooldown(1)
					.then(projectile({ speed: 50, range: 100 }))
					.build(),
			).to.throw("A: projectile has nothing to apply on hit");
		});

		it("rejects onHit when nothing falls back to it", () => {
			expect(() =>
				ability("A")
					.cooldown(1)
					.then(area(sphere(5), damage(5)))
					.onHit(heal(5))
					.build(),
			).to.throw("A: onHit is never used");
		});

		it("rejects hit producers inside hit effects that would fall back to onHit", () => {
			expect(() =>
				ability("A")
					.cooldown(1)
					.then(projectile({ speed: 50, range: 100 }))
					.onHit(area(sphere(5)))
					.build(),
			).to.throw("A: area inside hit effects needs effects of its own");
		});

		it("rejects timelines that only wait", () => {
			expect(() => ability("A").cooldown(1).then(pause(1)).build()).to.throw("A: the timeline only waits");
		});

		it("rejects empty or malformed composites", () => {
			expect(() => sequence()).to.throw("sequence needs at least one effect");
			expect(() => parallel()).to.throw("parallel needs at least one effect");
			expect(() => repeated(0, 1, damage(1))).to.throw("repeated count must be a whole number of at least 1");
			expect(() => repeated(1.5, 1, damage(1))).to.throw("repeated count must be a whole number of at least 1");
			expect(() => repeated(2, -1, damage(1))).to.throw("repeated interval must be zero or more");
		});

		it("rejects bad effect arguments", () => {
			expect(() => damage(-5)).to.throw("damage must be a positive number");
			expect(() => heal(0)).to.throw("heal must be a positive number");
			expect(() => dash(0)).to.throw("dash speed must be a positive number");
			expect(() => knockback(10, -1)).to.throw("knockback lift must be zero or more");
			expect(() => applyStatus("", 1)).to.throw("applyStatus needs a status name");
			expect(() => applyStatus("burn", 0)).to.throw("burn duration must be a positive number");
			expect(() => projectile({ speed: 0, range: 10 })).to.throw("projectile speed must be a positive number");
			expect(() => projectile({ speed: 10, range: 10, pierce: 1.5 })).to.throw(
				"projectile pierce must be a whole number",
			);
			expect(() => sphere(0)).to.throw("sphere radius must be a positive number");
			expect(() => box(new Vector3(4, 0, 4))).to.throw("box size must be positive on every axis");
		});
	});
};
