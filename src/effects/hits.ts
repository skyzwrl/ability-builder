import { flatUnit } from "../direction";
import { applyHit, instant, type EffectContext, type InstantEffect } from "../effect";
import { assertNonNegative, assertPositive, assertWhole } from "../validation";

export type AreaShape =
	| { readonly kind: "sphere"; readonly radius: number; readonly offset: CFrame }
	| { readonly kind: "box"; readonly size: Vector3; readonly offset: CFrame };

export interface ProjectileOptions {
	readonly speed: number;
	readonly range: number;
	readonly radius?: number;
	readonly pierce?: number;
}

export interface ProjectileRequest {
	readonly ability: string;
	readonly caster: Model;
	readonly origin: Vector3;
	readonly direction: Vector3;
	readonly speed: number;
	readonly range: number;
	readonly radius: number;
	readonly pierce: number;
	readonly target: Model | undefined;
	readonly onHit: (target: Model, position: Vector3) => void;
}

export function sphere(radius: number, offset = new CFrame()): AreaShape {
	assertPositive("sphere radius", radius);
	return { kind: "sphere", radius, offset };
}

export function box(size: Vector3, offset = new CFrame()): AreaShape {
	if (!(size.X > 0 && size.Y > 0 && size.Z > 0)) {
		throw `box size must be positive on every axis (got ${size})`;
	}
	return { kind: "box", size, offset };
}

export function projectile(options: ProjectileOptions, ...effects: InstantEffect[]): InstantEffect {
	const { speed, range, radius = 0.5, pierce = 0 } = options;
	assertPositive("projectile speed", speed);
	assertPositive("projectile range", range);
	assertNonNegative("projectile radius", radius);
	assertWhole("projectile pierce", pierce, 0);

	return instant({
		name: "projectile",
		appliesTo: "caster",
		hitEffects: effects,
		run: (context) => {
			const hitEffects = effects.isEmpty() ? context.ability.onHit : effects;
			context.host.spawnProjectile({
				ability: context.ability.name,
				caster: context.caster,
				origin: context.origin,
				direction: context.direction,
				speed,
				range,
				radius,
				pierce,
				target: context.target,
				onHit: (target, position) => applyHit(context, target, position, hitEffects),
			});
		},
	});
}

function areaCenter(context: EffectContext): Vector3 {
	if (context.source === "hit") {
		return context.origin;
	} else if (context.point) {
		return context.point;
	} else if (context.target) {
		return context.host.getPivot(context.target).Position;
	}
	return context.origin;
}

export function area(shape: AreaShape, ...effects: InstantEffect[]): InstantEffect {
	return instant({
		name: "area",
		appliesTo: "caster",
		hitEffects: effects,
		run: (context) => {
			const center = areaCenter(context);
			const facing = flatUnit(context.direction);
			const frame = (facing ? CFrame.lookAt(center, center.add(facing)) : new CFrame(center)).mul(shape.offset);
			const hitEffects = effects.isEmpty() ? context.ability.onHit : effects;

			const seen = new Set<Model>();
			for (const model of context.host.queryArea(shape, frame, context.caster)) {
				if (model === context.caster || seen.has(model)) {
					continue;
				}
				seen.add(model);
				applyHit(context, model, frame.Position, hitEffects);
			}
		},
	});
}
