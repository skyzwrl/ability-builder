/// <reference types="@rbxts/testez/globals" />

import { ability, pause, effect, parallel, repeated, sequence, when, type AbilityDefinition } from "..";
import { round } from "./support";

function noop(name: string) {
	return effect(name, () => undefined, "caster");
}

function describeSteps(definition: AbilityDefinition): string {
	return definition.steps
		.map((step) => `${step.kind === "effect" ? step.effect.name : "gate"}@${round(step.time)}`)
		.join(",");
}

export = () => {
	describe("compiled timeline", () => {
		it("lays sequences end to end after the windup", () => {
			const definition = ability("Combo")
				.cooldown(1)
				.windup(0.3)
				.then(sequence(noop("a"), pause(0.5), noop("b")))
				.then(noop("c"))
				.build();

			expect(describeSteps(definition)).to.equal("a@0.3,b@0.8,c@0.8");
		});

		it("starts parallel branches together and waits for the longest", () => {
			const definition = ability("Volley")
				.cooldown(1)
				.then(parallel(sequence(pause(0.2), noop("late")), noop("now")))
				.then(noop("after"))
				.build();

			expect(describeSteps(definition)).to.equal("now@0,late@0.2,after@0.2");
		});

		it("spaces repeats by their interval", () => {
			const definition = ability("Pulse")
				.cooldown(1)
				.windup(1)
				.then(repeated(4, 0.25, noop("tick")))
				.build();

			expect(describeSteps(definition)).to.equal("tick@1,tick@1.25,tick@1.5,tick@1.75");
			expect(definition.duration).to.be.near(1.75);
		});

		it("puts onActivate effects at zero, before the windup", () => {
			const definition = ability("Cast")
				.cooldown(1)
				.windup(0.5)
				.onActivate(noop("anim"))
				.then(noop("hit"))
				.build();

			expect(describeSteps(definition)).to.equal("anim@0,hit@0.5");
		});

		it("keeps scheduling order for steps at the same time", () => {
			const definition = ability("Burst")
				.cooldown(1)
				.then(parallel(noop("a"), noop("b"), sequence(noop("c"), noop("d"))))
				.then(noop("e"))
				.build();

			expect(describeSteps(definition)).to.equal("a@0,b@0,c@0,d@0,e@0");
		});

		it("places a gate ahead of the steps it guards", () => {
			const definition = ability("Execute")
				.cooldown(1)
				.then(noop("a"))
				.then(when(() => true, sequence(noop("b"), pause(1), noop("c"))))
				.then(noop("d"))
				.build();

			expect(describeSteps(definition)).to.equal("a@0,gate@0,b@0,c@1,d@1");

			const [, gateStep, guarded] = definition.steps;
			expect(gateStep.kind).to.equal("gate");
			expect(gateStep.kind === "gate" && guarded.gate === gateStep.opens).to.equal(true);
			expect(definition.steps[0].gate).never.to.be.ok();
		});
	});
};
