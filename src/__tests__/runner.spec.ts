/// <reference types="@rbxts/testez/globals" />

import {
	ability,
	AbilityRunner,
	damage,
	pause,
	effect,
	parallel,
	repeated,
	ResourcePool,
	sequence,
	when,
	type AbilityDefinition,
} from "..";
import { FakeHost, mark, round, stamp } from "./support";

function runUntilIdle(runner: AbilityRunner, dt: number): void {
	for (let frame = 0; frame < 10000 && runner.isBusy(); frame++) {
		runner.update(dt);
	}
}

export = () => {
	let host: FakeHost;
	let caster: Model;
	let mana: ResourcePool;
	let runner: AbilityRunner;

	beforeEach(() => {
		host = new FakeHost();
		caster = host.spawn("caster");
		mana = new ResourcePool({ mana: 100, stamina: 5 });
		runner = new AbilityRunner(host, caster, mana);
	});

	describe("timeline", () => {
		it("fires steps in the same order whatever the frame size", () => {
			const log = new Array<string>();
			const definition = ability("Combo")
				.cooldown(0)
				.windup(0.3)
				.onActivate(mark("cast", log))
				.then(mark("a", log))
				.then(pause(0.5))
				.then(parallel(mark("b", log), sequence(pause(0.2), mark("c", log))))
				.then(repeated(3, 0.25, mark("d", log)))
				.build();

			for (const dt of [1 / 60, 0.1, 0.25, 0.7, 10]) {
				log.clear();
				const fresh = new AbilityRunner(host, caster, mana);
				fresh.activate(definition);
				runUntilIdle(fresh, dt);
				expect(log.join(",")).to.equal("cast,a,b,c,d,d,d");
			}
		});

		it("never fires early and at most one frame late", () => {
			const times = new Array<number>();
			const definition = ability("Pulse")
				.cooldown(0)
				.windup(0.35)
				.then(repeated(4, 0.3, stamp("tick", times)))
				.build();
			const dt = 1 / 30;

			runner.activate(definition);
			runUntilIdle(runner, dt);

			expect(times.size()).to.equal(4);
			for (let index = 0; index < 4; index++) {
				const scheduled = 0.35 + index * 0.3;
				expect(times[index] >= scheduled - 1e-6 && times[index] < scheduled + dt).to.equal(true);
			}
		});

		it("fires steps at time zero during activate", () => {
			const log = new Array<string>();
			runner.activate(ability("Instant").cooldown(1).then(mark("hit", log)).build());

			expect(log.join(",")).to.equal("hit");
			expect(runner.isBusy()).to.equal(false);
		});

		it("runs onActivate effects right away and the rest after the windup", () => {
			const log = new Array<string>();
			runner.activate(
				ability("Cast").cooldown(1).windup(0.5).onActivate(mark("anim", log)).then(mark("hit", log)).build(),
			);

			expect(log.join(",")).to.equal("anim");
			runner.update(0.25);
			expect(log.join(",")).to.equal("anim");
			runner.update(0.25);
			expect(log.join(",")).to.equal("anim,hit");
		});

		it("stays busy until the duration runs out", () => {
			runner.activate(ability("Recovery").cooldown(0).then(damage(5)).then(pause(1)).build());

			runner.update(0.9);
			expect(runner.isBusy()).to.equal(true);
			expect(runner.getActive()?.name).to.equal("Recovery");
			runner.update(0.1);
			expect(runner.isBusy()).to.equal(false);
		});
	});

	describe("when", () => {
		it("skips the branch but keeps the timing of what follows", () => {
			const log = new Array<string>();
			const times = new Array<number>();
			runner.activate(
				ability("Maybe")
					.cooldown(0)
					.then(when(() => false, sequence(mark("x", log), pause(1), mark("y", log))))
					.then(stamp("z", times))
					.build(),
			);
			runUntilIdle(runner, 0.1);

			expect(log.size()).to.equal(0);
			expect(times.size()).to.equal(1);
			expect(round(times[0])).to.equal(1);
		});

		it("checks the predicate once, when the branch starts", () => {
			const log = new Array<string>();
			let checks = 0;
			let checkedAt = -1;
			runner.activate(
				ability("Once")
					.cooldown(0)
					.windup(0.5)
					.then(
						when(
							(context) => {
								checks += 1;
								checkedAt = context.elapsed;
								return true;
							},
							sequence(mark("x", log), pause(0.5), mark("y", log)),
						),
					)
					.build(),
			);
			runUntilIdle(runner, 0.05);

			expect(checks).to.equal(1);
			expect(round(checkedAt)).to.equal(0.5);
			expect(log.join(",")).to.equal("x,y");
		});

		it("never evaluates an inner predicate when the outer one fails", () => {
			let innerChecks = 0;
			runner.activate(
				ability("Nested")
					.cooldown(0)
					.then(
						when(
							() => false,
							when(() => {
								innerChecks += 1;
								return true;
							}, damage(5)),
						),
					)
					.build(),
			);

			expect(innerChecks).to.equal(0);
			expect(host.log.size()).to.equal(0);
		});
	});

	describe("cancel", () => {
		let definition: AbilityDefinition;
		let log: string[];

		beforeEach(() => {
			log = [];
			definition = ability("Charged")
				.cost("mana", 20)
				.cooldown(5)
				.windup(0.2)
				.then(mark("first", log))
				.then(pause(1))
				.then(mark("second", log))
				.build();
		});

		it("refunds costs and skips the cooldown during the windup", () => {
			runner.activate(definition);
			expect(mana.get("mana")).to.equal(80);

			runner.update(0.1);
			expect(runner.cancel()).to.equal(true);
			runner.update(1);

			expect(log.size()).to.equal(0);
			expect(mana.get("mana")).to.equal(100);
			expect(runner.cooldownRemaining("Charged")).to.equal(0);
			expect(runner.activate(definition)).to.equal("activated");
		});

		it("keeps costs and cooldown once committed, and drops pending steps", () => {
			runner.activate(definition);
			runner.update(0.3);
			expect(log.join(",")).to.equal("first");

			runner.cancel();
			runner.update(2);

			expect(log.join(",")).to.equal("first");
			expect(mana.get("mana")).to.equal(80);
			expect(runner.cooldownRemaining("Charged")).to.be.near(5.2 - 2.3);
		});

		it("returns false with nothing to cancel", () => {
			expect(runner.cancel()).to.equal(false);
		});

		it("lets an effect cancel its own activation", () => {
			const order = new Array<string>();
			const selfCancelling = ability("Fizzle")
				.cooldown(0)
				.then(effect("stop", () => runner.cancel(), "caster"))
				.then(mark("never", order))
				.build();

			runner.activate(selfCancelling);

			expect(order.size()).to.equal(0);
			expect(runner.isBusy()).to.equal(false);
		});
	});

	describe("cooldowns and costs", () => {
		it("reports the cooldown until it has fully elapsed", () => {
			const definition = ability("Jab").cooldown(1).then(damage(5)).build();
			runner.activate(definition);

			for (let frame = 0; frame < 9; frame++) {
				runner.update(0.1);
				expect(runner.activate(definition)).to.equal("onCooldown");
			}
			runner.update(0.1);
			expect(runner.activate(definition)).to.equal("activated");
		});

		it("starts the cooldown when the windup ends, however long the frame was", () => {
			const definition = ability("Slam").cooldown(2).windup(0.5).then(damage(5)).build();

			runner.activate(definition);
			runner.update(0.6);
			expect(runner.cooldownRemaining("Slam")).to.be.near(1.9);

			runner.update(10);
			expect(runner.cooldownRemaining("Slam")).to.equal(0);
		});

		it("can reset a cooldown", () => {
			const definition = ability("Jab").cooldown(10).then(damage(5)).build();
			runner.activate(definition);
			runner.resetCooldown("Jab");

			expect(runner.activate(definition)).to.equal("activated");
		});

		it("refuses when any cost can't be paid and charges nothing", () => {
			const definition = ability("Expensive")
				.cost("mana", 20)
				.cost("stamina", 10)
				.cooldown(0)
				.then(damage(5))
				.build();

			expect(runner.activate(definition)).to.equal("cannotAfford");
			expect(mana.get("mana")).to.equal(100);
			expect(mana.get("stamina")).to.equal(5);
		});

		it("is busy while another activation runs", () => {
			const long = ability("Long").cooldown(0).then(damage(5)).then(pause(2)).build();
			const short = ability("Short").cooldown(0).then(damage(5)).build();

			runner.activate(long);
			expect(runner.activate(short)).to.equal("busy");
			expect(runner.canActivate(short)).to.equal("busy");
		});

		it("errors when a definition with costs runs without resources", () => {
			const bare = new AbilityRunner(host, caster);
			const definition = ability("Costly").cost("mana", 5).cooldown(0).then(damage(5)).build();

			expect(() => bare.activate(definition)).to.throw(
				"Costly has costs but this runner was created without resources",
			);
		});
	});

	describe("targeting", () => {
		it("needs the input its targeting mode asks for", () => {
			const strike = ability("Strike").cooldown(0).targeting("target").then(damage(5)).build();
			const meteor = ability("Meteor")
				.cooldown(0)
				.targeting("point")
				.then(effect("x", () => undefined, "caster"))
				.build();
			const beam = ability("Beam")
				.cooldown(0)
				.targeting("direction")
				.then(effect("x", () => undefined, "caster"))
				.build();

			expect(runner.canActivate(strike)).to.equal("missingTarget");
			expect(runner.canActivate(meteor)).to.equal("missingTarget");
			expect(runner.canActivate(beam)).to.equal("missingTarget");
			expect(runner.canActivate(beam, { direction: Vector3.zero })).to.equal("missingTarget");
			expect(runner.canActivate(beam, { direction: new Vector3(0, 0, -1) })).never.to.be.ok();
		});

		it("checks the range against the target's position", () => {
			const strike = ability("Strike").cooldown(0).targeting("target", 10).then(damage(5)).build();
			const near = host.spawn("near", new CFrame(0, 0, -8));
			const far = host.spawn("far", new CFrame(0, 0, -12));

			expect(runner.canActivate(strike, { target: far })).to.equal("outOfRange");
			expect(runner.canActivate(strike, { target: near })).never.to.be.ok();
		});

		it("checks the range against the chosen point", () => {
			const meteor = ability("Meteor")
				.cooldown(0)
				.targeting("point", 30)
				.then(effect("x", () => undefined, "caster"))
				.build();

			expect(runner.canActivate(meteor, { point: new Vector3(40, 0, 0) })).to.equal("outOfRange");
			expect(runner.canActivate(meteor, { point: new Vector3(20, 0, 0) })).never.to.be.ok();
		});

		it("applies subject effects to the target", () => {
			const enemy = host.spawn("enemy", new CFrame(0, 0, -5));
			runner.activate(ability("Strike").cooldown(0).targeting("target").then(damage(12, "slash")).build(), {
				target: enemy,
			});

			expect(host.log.join(",")).to.equal("damage enemy 12 slash by caster");
		});

		it("applies subject effects to the caster with self targeting", () => {
			runner.activate(ability("Sacrifice").cooldown(0).then(damage(3)).build());

			expect(host.log.join(",")).to.equal("damage caster 3 physical by caster");
		});
	});
};
