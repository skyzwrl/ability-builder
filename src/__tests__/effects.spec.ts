/// <reference types="@rbxts/testez/globals" />

import {
	ability,
	AbilityRunner,
	applyStatus,
	area,
	box,
	damage,
	dash,
	effect,
	heal,
	knockback,
	projectile,
	ResourcePool,
	sphere,
	type EffectContext,
} from "..";
import { FakeHost, near } from "./support";

export = () => {
	let host: FakeHost;
	let caster: Model;
	let runner: AbilityRunner;

	beforeEach(() => {
		host = new FakeHost();
		caster = host.spawn("caster");
		runner = new AbilityRunner(host, caster, new ResourcePool());
	});

	describe("subject effects", () => {
		it("damages, heals and applies statuses with the caster as the source", () => {
			const enemy = host.spawn("enemy", new CFrame(0, 0, -5));
			runner.activate(
				ability("Combo")
					.cooldown(0)
					.targeting("target")
					.then(damage(10, "fire"))
					.then(heal(4))
					.then(applyStatus("burn", 3))
					.build(),
				{ target: enemy },
			);

			expect(host.log.join(",")).to.equal(
				"damage enemy 10 fire by caster,heal enemy 4 by caster,status enemy burn 3 by caster",
			);
		});

		it("knocks the subject away from the caster", () => {
			const enemy = host.spawn("enemy", new CFrame(10, 0, 0));
			runner.activate(ability("Shove").cooldown(0).targeting("target").then(knockback(40, 5)).build(), {
				target: enemy,
			});

			expect(host.log.join(",")).to.equal("velocity enemy");
			expect(near(host.velocities[0], new Vector3(40, 5, 0))).to.equal(true);
		});

		it("passes a custom effect the context and its subject", () => {
			const enemy = host.spawn("enemy", new CFrame(0, 0, -6));
			let seen: EffectContext | undefined;
			let seenSubject: Model | undefined;

			runner.activate(
				ability("Probe")
					.cooldown(0)
					.targeting("target")
					.windup(0.25)
					.then(
						effect("probe", (context, subject) => {
							seen = context;
							seenSubject = subject;
						}),
					)
					.build(),
				{ target: enemy },
			);
			runner.update(0.25);

			expect(seenSubject).to.equal(enemy);
			expect(seen!.ability.name).to.equal("Probe");
			expect(seen!.caster).to.equal(caster);
			expect(seen!.target).to.equal(enemy);
			expect(seen!.source).to.equal("cast");
			expect(seen!.elapsed).to.be.near(0.25);
			expect(near(seen!.direction, new Vector3(0, 0, -1))).to.equal(true);
		});
	});

	describe("dash", () => {
		it("moves the caster along the flattened aim direction", () => {
			runner.activate(ability("Lunge").cooldown(0).targeting("direction").then(dash(50, 10)).build(), {
				direction: new Vector3(1, 1, 0),
			});

			expect(host.log.join(",")).to.equal("velocity caster");
			expect(near(host.velocities[0], new Vector3(50, 10, 0))).to.equal(true);
		});

		it("follows the look vector with self targeting", () => {
			runner.activate(ability("Step").cooldown(0).then(dash(30)).build());

			expect(near(host.velocities[0], new Vector3(0, 0, -30))).to.equal(true);
		});
	});

	describe("projectile", () => {
		it("hands the spawner a request aimed at the point", () => {
			runner.activate(
				ability("Fireball")
					.cooldown(0)
					.targeting("point")
					.then(projectile({ speed: 120, range: 200 }))
					.onHit(damage(25, "fire"))
					.build(),
				{ point: new Vector3(0, 0, -50) },
			);

			const request = host.projectiles[0];
			expect(request.ability).to.equal("Fireball");
			expect(request.caster).to.equal(caster);
			expect(near(request.origin, Vector3.zero)).to.equal(true);
			expect(near(request.direction, new Vector3(0, 0, -1))).to.equal(true);
			expect(request.speed).to.equal(120);
			expect(request.range).to.equal(200);
			expect(request.radius).to.equal(0.5);
			expect(request.pierce).to.equal(0);
			expect(request.target).never.to.be.ok();
		});

		it("applies onHit effects from the impact point", () => {
			runner.activate(
				ability("Fireball")
					.cooldown(0)
					.targeting("direction")
					.then(projectile({ speed: 120, range: 200 }))
					.onHit(damage(25, "fire"), knockback(30))
					.build(),
				{ direction: new Vector3(0, 0, -1) },
			);

			const enemy = host.spawn("enemy", new CFrame(3, 0, -40));
			host.projectiles[0].onHit(enemy, new Vector3(0, 0, -40));

			expect(host.log.join(",")).to.equal("projectile Fireball,damage enemy 25 fire by caster,velocity enemy");
			expect(near(host.velocities[0], new Vector3(30, 0, 0))).to.equal(true);
		});

		it("prefers its own effects over onHit", () => {
			const ally = host.spawn("ally");
			const enemy = host.spawn("enemy");
			host.areaResult = [enemy];

			runner.activate(
				ability("Split")
					.cooldown(0)
					.then(projectile({ speed: 50, range: 100 }, heal(5)))
					.then(area(sphere(4)))
					.onHit(damage(1))
					.build(),
			);
			host.projectiles[0].onHit(ally, Vector3.zero);

			expect(host.log.join(",")).to.equal(
				"projectile Split,damage enemy 1 physical by caster,heal ally 5 by caster",
			);
		});

		it("can explode into an area where it lands", () => {
			const first = host.spawn("first");
			const second = host.spawn("second");
			host.areaResult = [first, second];

			runner.activate(
				ability("Grenade")
					.cooldown(0)
					.targeting("direction")
					.then(projectile({ speed: 60, range: 80 }))
					.onHit(area(sphere(8), damage(30)))
					.build(),
				{ direction: new Vector3(0, 0, -1) },
			);
			host.projectiles[0].onHit(first, new Vector3(0, 0, -30));

			expect(near(host.queries[0].frame.Position, new Vector3(0, 0, -30))).to.equal(true);
			expect(host.log.join(",")).to.equal(
				"projectile Grenade,damage first 30 physical by caster,damage second 30 physical by caster",
			);
		});
	});

	describe("area", () => {
		it("queries around the point and hits each model once, never the caster", () => {
			const a = host.spawn("a");
			const b = host.spawn("b");
			host.areaResult = [a, b, a, caster];

			runner.activate(
				ability("Meteor")
					.cooldown(0)
					.targeting("point")
					.then(area(sphere(12), damage(40)))
					.build(),
				{
					point: new Vector3(0, 0, -20),
				},
			);

			const query = host.queries[0];
			expect(query.shape.kind).to.equal("sphere");
			expect(query.caster).to.equal(caster);
			expect(near(query.frame.Position, new Vector3(0, 0, -20))).to.equal(true);
			expect(host.log.join(",")).to.equal("damage a 40 physical by caster,damage b 40 physical by caster");
		});

		it("pushes hits away from the centre of the area", () => {
			const enemy = host.spawn("enemy", new CFrame(5, 0, -20));
			host.areaResult = [enemy];

			runner.activate(
				ability("Quake")
					.cooldown(0)
					.targeting("point")
					.then(area(sphere(12), knockback(25)))
					.build(),
				{
					point: new Vector3(0, 0, -20),
				},
			);

			expect(near(host.velocities[0], new Vector3(25, 0, 0))).to.equal(true);
		});

		it("offsets a box in front of the caster", () => {
			runner.activate(
				ability("Cleave")
					.cooldown(0)
					.then(area(box(new Vector3(6, 6, 8), new CFrame(0, 0, -4)), damage(15)))
					.build(),
			);

			const frame = host.queries[0].frame;
			expect(near(frame.Position, new Vector3(0, 0, -4))).to.equal(true);
			expect(near(frame.LookVector, new Vector3(0, 0, -1))).to.equal(true);
		});

		it("centres on the target with target targeting", () => {
			const enemy = host.spawn("enemy", new CFrame(0, 0, -10));

			runner.activate(
				ability("Smite")
					.cooldown(0)
					.targeting("target")
					.then(area(sphere(6), damage(20)))
					.build(),
				{ target: enemy },
			);

			expect(near(host.queries[0].frame.Position, new Vector3(0, 0, -10))).to.equal(true);
		});

		it("runs caster effects inside hits on the caster", () => {
			const a = host.spawn("a");
			const b = host.spawn("b");
			host.areaResult = [a, b];
			const lifesteal = effect(
				"lifesteal",
				(context, subject) => context.host.heal(subject, 5, context.caster),
				"caster",
			);

			runner.activate(
				ability("Drain")
					.cooldown(0)
					.then(area(sphere(10)))
					.onHit(damage(20), lifesteal)
					.build(),
			);

			expect(host.log.join(",")).to.equal(
				"damage a 20 physical by caster,heal caster 5 by caster,damage b 20 physical by caster,heal caster 5 by caster",
			);
		});
	});
};
