import { Players, ReplicatedStorage, RunService, Workspace } from "@rbxts/services";
import {
	AbilityRegistry,
	AbilityRunner,
	ResourcePool,
	RobloxHost,
	type ActivationParams,
	type ProjectileRequest,
} from "@skyzwrl/ability-builder";
import { execute, fireball, lungeStrike, meteor, rejuvenate, whirlwind } from "./abilities";

const MAX_MANA = 100;
const MANA_PER_SECOND = 6;

const registry = new AbilityRegistry();
registry.register(fireball, meteor, whirlwind, lungeStrike, rejuvenate, execute);

function characterOf(instance: Instance): Model | undefined {
	const model = instance.FindFirstAncestorOfClass("Model");
	return model?.FindFirstChildOfClass("Humanoid") ? model : undefined;
}

// hitscan stand in, swap for a real projectile system that calls request.onHit
function fireHitscan(request: ProjectileRequest): void {
	const params = new RaycastParams();
	params.FilterType = Enum.RaycastFilterType.Exclude;
	params.FilterDescendantsInstances = [request.caster];

	const result = Workspace.Raycast(request.origin, request.direction.mul(request.range), params);
	const hit = result && characterOf(result.Instance);
	if (result && hit) {
		request.onHit(hit, result.Position);
	}
}

const host = new RobloxHost({
	spawnProjectile: fireHitscan,
	applyStatus: (target, status, duration) => target.SetAttribute(status, Workspace.GetServerTimeNow() + duration),
	canHit: (caster, target) => {
		const attacker = Players.GetPlayerFromCharacter(caster);
		const victim = Players.GetPlayerFromCharacter(target);
		return attacker?.Team === undefined || attacker.Team !== victim?.Team;
	},
});

const runners = new Map<Player, AbilityRunner>();
const pools = new Map<Player, ResourcePool>();

Players.PlayerAdded.Connect((player) => {
	player.CharacterAdded.Connect((character) => {
		const pool = new ResourcePool({ mana: MAX_MANA, stamina: 100 });
		pools.set(player, pool);
		runners.set(player, new AbilityRunner(host, character, pool));
	});
});

Players.PlayerRemoving.Connect((player) => {
	runners.delete(player);
	pools.delete(player);
});

RunService.Heartbeat.Connect((dt) => {
	for (const [player, runner] of runners) {
		runner.update(dt);
		const pool = pools.get(player);
		pool?.set("mana", math.min(MAX_MANA, pool.get("mana") + MANA_PER_SECOND * dt));
	}
});

const summaries = new Instance("RemoteFunction");
summaries.Name = "AbilitySummaries";
summaries.OnServerInvoke = () => registry.summaries();
summaries.Parent = ReplicatedStorage;

const cast = new Instance("RemoteEvent");
cast.Name = "CastAbility";
cast.Parent = ReplicatedStorage;

cast.OnServerEvent.Connect((player, name, target, point, direction) => {
	const runner = runners.get(player);
	const definition = typeIs(name, "string") ? registry.get(name) : undefined;
	if (!runner || !definition) {
		return;
	}

	const params: ActivationParams = {
		target: typeIs(target, "Instance") && target.IsA("Model") ? target : undefined,
		point: typeIs(point, "Vector3") ? point : undefined,
		direction: typeIs(direction, "Vector3") ? direction : undefined,
	};
	runner.activate(definition, params);
});
