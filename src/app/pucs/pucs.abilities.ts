import { Buff, Puc } from './pucs.model';

/**
 * The surface the game exposes to skill effects, so effect code stays out of
 * the component. Everything a skill can do to the board goes through here.
 */
export interface GameApi {
  allPucs(): Puc[];
  centre(): { x: number; y: number };
  playRadius(): number;
  /** Raises a puc's tier, clamped to the game's maximum. */
  bumpTier(puc: Puc, amount: number): void;
  /** Rewrites a puc's character type (colour + image follow). */
  setType(puc: Puc, type: number): void;
  /** Arms a puc's fuse; 0 detonates on the next frame. */
  arm(puc: Puc, fuseMs: number): void;
  move(puc: Puc, x: number, y: number): void;
  addLeaderCharge(amount: number): void;
  leaderChargeMax(): number;
  setLinkRangeMultiplier(multiplier: number): void;
  addBuff(buff: Buff): void;
  /** Character type index of the equipped leader, or -1 if none. */
  leaderType(): number;
  typeCount(): number;
}

export interface SkillDef {
  id: string;
  name: string;
  chargeMax: number;
  apply(game: GameApi): void;
}

/** Leader skills fill fastest — they are the bread-and-butter button. */
export const LEADER_CHARGE_MAX = 600;
/** Abilities are deliberately slower to charge than the leader skill. */
export const ABILITY_CHARGE_MAX = 1500;

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function pucsNearCentre(game: GameApi, radius: number): Puc[] {
  const centre = game.centre();
  return game.allPucs().filter(puc =>
    !puc.removing && distance(puc.x, puc.y, centre.x, centre.y) <= radius
  );
}

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks the three densest clusters on the board by scoring every puc on how
 * many neighbours sit within `radius`, then greedily taking the best
 * non-overlapping centres.
 */
function densestClusters(game: GameApi, radius: number, count: number): Puc[] {
  const alive = game.allPucs().filter(puc => !puc.removing);
  const scored = alive.map(puc => ({
    puc,
    neighbours: alive.filter(other => distance(puc.x, puc.y, other.x, other.y) <= radius).length
  }));
  scored.sort((a, b) => b.neighbours - a.neighbours);

  const chosen: Puc[] = [];
  for (const candidate of scored) {
    if (chosen.length >= count) break;
    const overlaps = chosen.some(picked =>
      distance(picked.x, picked.y, candidate.puc.x, candidate.puc.y) < radius * 1.5
    );
    if (!overlaps) chosen.push(candidate.puc);
  }
  return chosen;
}

/** The type that appears most often within `radius` of a point. */
function dominantType(game: GameApi, x: number, y: number, radius: number): number {
  const counts = new Map<number, number>();
  for (const puc of game.allPucs()) {
    if (puc.removing) continue;
    if (distance(puc.x, puc.y, x, y) > radius) continue;
    counts.set(puc.type, (counts.get(puc.type) || 0) + 1);
  }

  let best = Math.floor(Math.random() * game.typeCount());
  let bestCount = -1;
  counts.forEach((count, type) => {
    if (count > bestCount) {
      bestCount = count;
      best = type;
    }
  });
  return best;
}

export const LEADER_SKILLS: Record<string, SkillDef> = {
  pucpuc1: {
    id: 'pucpuc1',
    name: 'Hitagi Senjogahara',
    chargeMax: LEADER_CHARGE_MAX,
    // Increase the size of random PucPucs.
    apply(game) {
      const targets = shuffled(game.allPucs().filter(puc => !puc.removing)).slice(0, 8);
      targets.forEach(puc => game.bumpTier(puc, 2));
    }
  },

  pucpuc2: {
    id: 'pucpuc2',
    name: 'Koyomi Araragi',
    chargeMax: LEADER_CHARGE_MAX,
    // Increase the size of PucPucs around the middle of the screen.
    apply(game) {
      pucsNearCentre(game, 120).forEach(puc => game.bumpTier(puc, 3));
    }
  },

  pucpuc3: {
    id: 'pucpuc3',
    name: 'Nadeko Sengoku',
    chargeMax: LEADER_CHARGE_MAX,
    // Increase the size of the smallest PucPucs on the stage.
    apply(game) {
      const smallest = game.allPucs()
        .filter(puc => !puc.removing)
        .sort((a, b) => a.tier - b.tier)
        .slice(0, 10);
      smallest.forEach(puc => game.bumpTier(puc, 3));
    }
  },

  pucpuc4: {
    id: 'pucpuc4',
    name: 'Shinobu Oshino',
    chargeMax: LEADER_CHARGE_MAX,
    // Grow the PucPucs around the middle, drop them at the top of the screen
    // and explode them immediately.
    apply(game) {
      const centre = game.centre();
      const targets = pucsNearCentre(game, 140);
      targets.forEach((puc, index) => {
        game.bumpTier(puc, 4);
        // Fan them across the top of the play circle so the blasts spread out.
        const spread = targets.length > 1 ? (index / (targets.length - 1)) - 0.5 : 0;
        game.move(
          puc,
          centre.x + spread * game.playRadius() * 1.2,
          centre.y - game.playRadius() * 0.7
        );
        game.arm(puc, 0);
      });
    }
  },

  pucpuc5: {
    id: 'pucpuc5',
    name: 'Tsubasa Hanekawa',
    chargeMax: LEADER_CHARGE_MAX,
    // Target three areas and convert each area into one specific PucPuc.
    apply(game) {
      const radius = 110;
      const areas = densestClusters(game, radius, 3);
      for (const area of areas) {
        const target = dominantType(game, area.x, area.y, radius);
        for (const puc of game.allPucs()) {
          if (puc.removing) continue;
          if (distance(puc.x, puc.y, area.x, area.y) <= radius) {
            game.setType(puc, target);
          }
        }
      }
    }
  }
};

export const ABILITIES: Record<string, SkillDef> = {
  ability1: {
    id: 'ability1',
    name: 'Koyomi Dazed',
    chargeMax: ABILITY_CHARGE_MAX,
    // Leader PucPuc Size +5.
    apply(game) {
      const leaderType = game.leaderType();
      if (leaderType < 0) return;
      game.allPucs()
        .filter(puc => !puc.removing && puc.type === leaderType)
        .forEach(puc => game.bumpTier(puc, 5));
    }
  },

  ability2: {
    id: 'ability2',
    name: 'Hitagi Car ride',
    chargeMax: ABILITY_CHARGE_MAX,
    // Refill the stage with PucPucs of Size +2 for 7 seconds.
    apply(game) {
      game.addBuff({
        id: 'ability2',
        remaining: 7000,
        spawnTierBonus: 2,
        spawnIntervalMs: 180,
        spawnCooldown: 0
      });
    }
  },

  ability3: {
    id: 'ability3',
    name: 'Mayoi Butterfly',
    chargeMax: ABILITY_CHARGE_MAX,
    // Increase the leader's skill gauge by 50%.
    apply(game) {
      game.addLeaderCharge(game.leaderChargeMax() * 0.5);
    }
  },

  ability4: {
    id: 'ability4',
    name: 'Suruga Cooking',
    chargeMax: ABILITY_CHARGE_MAX,
    // Increase linking range to 1.15.
    apply(game) {
      game.setLinkRangeMultiplier(1.15);
    }
  }
};
