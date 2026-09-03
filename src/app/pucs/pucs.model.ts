export interface Puc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  type: number;
  selected: boolean;
  tier: number;
  image?: HTMLImageElement;

  /**
   * The centre node. It lives outside `pucs`, so physics, scoring and skills
   * never see it — it exists only so a chain can be routed through the middle.
   */
  isHub?: boolean;

  // Removal / combination animation. Timings accumulate from the frame delta
  // rather than Date.now(), so a pause freezes the tween instead of skipping it.
  removing?: boolean;
  scale?: number;
  combining?: boolean;
  combineElapsed?: number;
  combineDelay?: number;
  combineDuration?: number;
  startX?: number;
  startY?: number;
  targetX?: number;
  targetY?: number;

  // Fuse: a puc past the explosion threshold counts down and then detonates.
  // Tracked as remaining time (not an absolute deadline) so pausing freezes it.
  fuseRemaining?: number;
  fuseTotal?: number;
  /** Points banked into this puc, paid out again on every reset chain. */
  fusePoints?: number;
}

export interface Explosion {
  x: number;
  y: number;
  startTime: number;
  color: string;
  maxRadius: number;
  particles: { angle: number; speed: number; size: number }[];
}

export interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

/** A time-limited modifier applied by an ability (e.g. Hitagi Car ride). */
export interface Buff {
  id: string;
  remaining: number;
  /** Extra tier added to every puc spawned while this buff is live. */
  spawnTierBonus?: number;
  /** Milliseconds between forced spawns while this buff is live. */
  spawnIntervalMs?: number;
  spawnCooldown?: number;
}
