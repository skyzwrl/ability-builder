import type { Effect, Predicate } from "../effect";
import { assertNonNegative, assertPositive, assertWhole } from "../validation";

export function pause(seconds: number): Effect {
	assertPositive("pause", seconds);
	return { name: "pause", duration: seconds, schedule: () => undefined };
}

export function sequence(...effects: Effect[]): Effect {
	if (effects.isEmpty()) {
		throw "sequence needs at least one effect";
	}

	let duration = 0;
	for (const effect of effects) {
		duration += effect.duration;
	}

	return {
		name: "sequence",
		duration,
		schedule: (timeline, start) => {
			let time = start;
			for (const effect of effects) {
				effect.schedule(timeline, time);
				time += effect.duration;
			}
		},
	};
}

export function parallel(...effects: Effect[]): Effect {
	if (effects.isEmpty()) {
		throw "parallel needs at least one effect";
	}

	let duration = 0;
	for (const effect of effects) {
		duration = math.max(duration, effect.duration);
	}

	return {
		name: "parallel",
		duration,
		schedule: (timeline, start) => {
			for (const effect of effects) {
				effect.schedule(timeline, start);
			}
		},
	};
}

// the timing of whatever follows doesn't depend on the predicate, a skipped branch still takes its duration
export function when(predicate: Predicate, effect: Effect): Effect {
	return {
		name: "when",
		duration: effect.duration,
		schedule: (timeline, start) => timeline.gate(start, predicate, () => effect.schedule(timeline, start)),
	};
}

export function repeated(times: number, interval: number, effect: Effect): Effect {
	assertWhole("repeated count", times, 1);
	assertNonNegative("repeated interval", interval);

	return {
		name: "repeated",
		duration: (times - 1) * interval + effect.duration,
		schedule: (timeline, start) => {
			// start + index * interval rather than a running sum, long repeats would drift otherwise
			for (let index = 0; index < times; index++) {
				effect.schedule(timeline, start + index * interval);
			}
		},
	};
}
