import { flatUnit } from "../direction";
import { effect, type InstantEffect } from "../effect";
import { assertNonNegative, assertPositive } from "../validation";

export function damage(amount: number, damageType = "physical"): InstantEffect {
	assertPositive("damage", amount);
	return effect("damage", (context, subject) => context.host.damage(subject, amount, damageType, context.caster));
}

export function heal(amount: number): InstantEffect {
	assertPositive("heal", amount);
	return effect("heal", (context, subject) => context.host.heal(subject, amount, context.caster));
}

export function dash(speed: number, lift = 0): InstantEffect {
	assertPositive("dash speed", speed);
	assertNonNegative("dash lift", lift);

	return effect(
		"dash",
		(context, subject) => {
			const along =
				flatUnit(context.direction) ?? flatUnit(context.host.getPivot(subject).LookVector) ?? Vector3.zero;
			context.host.addVelocity(subject, along.mul(speed).add(new Vector3(0, lift, 0)));
		},
		"caster",
	);
}

export function knockback(force: number, lift = 0): InstantEffect {
	assertPositive("knockback force", force);
	assertNonNegative("knockback lift", lift);

	return effect("knockback", (context, subject) => {
		const offset = context.host.getPivot(subject).Position.sub(context.origin);
		const away = flatUnit(offset) ?? flatUnit(context.direction) ?? Vector3.zero;
		context.host.addVelocity(subject, away.mul(force).add(new Vector3(0, lift, 0)));
	});
}

export function applyStatus(status: string, duration: number): InstantEffect {
	if (status === "") {
		throw "applyStatus needs a status name";
	}
	assertPositive(`${status} duration`, duration);

	return effect("applyStatus", (context, subject) =>
		context.host.applyStatus(subject, status, duration, context.caster),
	);
}
