import {
	ability,
	applyStatus,
	area,
	box,
	damage,
	dash,
	effect,
	heal,
	knockback,
	pause,
	projectile,
	repeated,
	sphere,
	when,
} from "@skyzwrl/ability-builder";

// clients watch this attribute to play the matching cast animation
const castAnimation = effect(
	"cast animation",
	(context) => context.caster.SetAttribute("CastAnimation", context.ability.name),
	"caster",
);

export const fireball = ability("Fireball")
	.describe("hurls a ball of fire that sets whatever it hits alight")
	.cost("mana", 20)
	.cooldown(4)
	.windup(0.3)
	.targeting("direction")
	.onActivate(castAnimation)
	.then(projectile({ speed: 120, range: 200 }))
	.onHit(damage(25, "fire"), applyStatus("burn", 3))
	.build();

export const meteor = ability("Meteor")
	.describe("calls a meteor down on the marked spot")
	.cost("mana", 45)
	.cooldown(12)
	.windup(0.6)
	.targeting("point", 80)
	.onActivate(castAnimation)
	.then(pause(0.8))
	.then(area(sphere(12), damage(60, "fire"), knockback(60, 25)))
	.build();

export const whirlwind = ability("Whirlwind")
	.describe("spins in place, hitting everything nearby four times")
	.cost("stamina", 30)
	.cooldown(8)
	.then(repeated(4, 0.25, area(sphere(8))))
	.onHit(damage(8, "slash"), knockback(10))
	.build();

export const lungeStrike = ability("Lunge Strike")
	.cost("stamina", 15)
	.cooldown(5)
	.windup(0.15)
	.targeting("direction")
	.then(dash(90, 5))
	.then(pause(0.2))
	.then(area(box(new Vector3(6, 6, 8), new CFrame(0, 0, -4)), damage(22, "slash")))
	.build();

export const rejuvenate = ability("Rejuvenate")
	.describe("heals an ally over five seconds")
	.cost("mana", 30)
	.cooldown(10)
	.targeting("target", 40)
	.then(repeated(5, 1, heal(8)))
	.build();

function healthFraction(model: Model | undefined): number {
	const humanoid = model?.FindFirstChildOfClass("Humanoid");
	return humanoid ? humanoid.Health / humanoid.MaxHealth : 1;
}

// the gate is checked after the first hit lands, so the bonus sees the target's health after it
export const execute = ability("Execute")
	.describe("a heavy strike that finishes off wounded targets")
	.cooldown(15)
	.windup(0.4)
	.targeting("target", 8)
	.then(damage(30, "slash"))
	.then(when((context) => healthFraction(context.target) < 0.25, damage(200, "true")))
	.build();

// build() only type checks once a cooldown and at least one step are set:
//
// ability("Unfinished").then(damage(5)).build();
// error TS2684: The 'this' context of type 'AbilityBuilder<false, true>' is not assignable to method's
// 'this' of type 'AbilityBuilder<true, true>'.
