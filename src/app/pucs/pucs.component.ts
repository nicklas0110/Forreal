import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgIf, NgFor } from '@angular/common';
import { Router } from '@angular/router';
import { PucsMapComponent } from './pucs.map.component';
import { FireService, PucScoreEntry } from '../fire.service';
import { Buff, Explosion, Puc, Star } from './pucs.model';
import {
  ABILITIES,
  ABILITY_CHARGE_MAX,
  GameApi,
  LEADER_CHARGE_MAX,
  LEADER_SKILLS,
  SkillDef
} from './pucs.abilities';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A chain that is mid-animation; merges once its timer runs out. */
interface PendingMerge {
  remaining: number;
  x: number;
  y: number;
  type: number;
  tier: number;
  fuse: boolean;
  fusePoints: number;
  sources: Puc[];
}

type SkillSlot = 'Leader Puc' | 'Ability 1' | 'Ability 2';

@Component({
  selector: 'app-pucs',
  templateUrl: './pucs.component.html',
  styleUrls: ['./pucs.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, PucsMapComponent, NgIf, NgFor]
})
export class PucsComponent implements OnInit, AfterViewInit, OnDestroy, GameApi {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private canvas!: HTMLCanvasElement;

  private readonly GAME_DURATION = 120;
  private readonly HEADER_OFFSET = 100;
  private readonly CANVAS_WIDTH = 600;
  private readonly CANVAS_HEIGHT = 1050;
  private readonly PLAY_RADIUS = 280;
  private readonly PUC_RADIUS = 28;
  private readonly PUC_DISPLAY_SCALE = 1.3;

  private pucs: Puc[] = [];
  private selectedPucs: Puc[] = [];
  private pendingMerges: PendingMerge[] = [];
  private animationId: number = 0;
  private isMouseDown: boolean = false;
  private mousePosition: { x: number; y: number } | null = null;

  /**
   * The centre node a chain can route through. Deliberately not a member of
   * `pucs`: it is never simulated, drawn as a puc, scored or removed. It only
   * ever appears inside `selectedPucs`, and is filtered back out on release.
   */
  private readonly hub: Puc = {
    // Positioned in the constructor: PLAY_AREA_Y is declared further down.
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    type: -1,
    color: '#FFFFFF',
    selected: false,
    tier: 1,
    isHub: true
  };

  // Game state
  public score: number = 0;
  private timeLeft: number = 120;
  private feverMode: boolean = false;
  private feverGauge: number = 0;
  private readonly FEVER_THRESHOLD = 500;
  private scoreAtFeverStart: number = 0;
  private comboCount: number = 0;
  private lastComboTime: number = 0;

  private readonly COLORS = [
    '#FF6B6B',  // Hitagi
    '#4169E1',  // Nadeko
    '#9370DB',  // Koyomi
    '#FFA500',  // Tsubasa
    '#8B4513'   // Shinobu
  ];

  private readonly ATTRACTION_FORCE = 0.1;
  private readonly DAMPING = 0.95;
  private readonly CENTER_RADIUS = 32;
  private readonly MAX_SPEED = 2.5;
  /** Fraction of an overlap resolved per frame; below 1 to damp jitter. */
  private readonly COLLISION_RELAXATION = 0.7;
  private readonly CONNECTION_RANGE = 2.5;
  /** Raised by Suruga Cooking for the rest of the run. */
  private linkRangeMultiplier: number = 1;
  private spawnQueue: number = 0;

  private readonly INITIAL_PUCS = 50;
  /** Hard ceiling on how many pucs may share the board. */
  private readonly MAX_PUCS = 64;

  private pucImages: HTMLImageElement[] = [];
  private leaderImages: { [key: string]: HTMLImageElement } = {};
  private abilityImages: { [key: string]: HTMLImageElement } = {};

  private readonly PLAY_AREA_Y = this.CANVAS_HEIGHT / 2;
  /**
   * Pucs may drift past the drawn ring (and off the top/sides) so a crowded
   * board has somewhere to expand into — but never below this line, which sits
   * just above the fever gauge and skill buttons.
   */
  private readonly PLAY_FLOOR = this.PLAY_AREA_Y + this.PLAY_RADIUS + 20;

  private readonly MAX_TIER = 20;
  private readonly TIER_SCALE_FACTOR = 1.10;
  private readonly EXPLOSION_THRESHOLD = 10;
  private readonly MAX_VISUAL_SIZE = 2.0;

  /** How long an armed puc blinks before it detonates. */
  private readonly FUSE_DURATION = 1500;

  private readonly SINGLE_TAP_POINT_MULTIPLIER = 0.8;

  private readonly FEVER_DURATION = 10000;
  private feverTimeLeft: number = 0;

  private readonly CENTER_Y_VISUAL_OFFSET = 0;

  private centerImage: HTMLImageElement | null = null;
  private centerFeverImage: HTMLImageElement | null = null;
  private readonly CENTER_IMAGE_SIZE = 88;

  private lastUpdateTime: number = 0;

  private readonly MAX_CHAIN_MULTIPLIER = 2.0;

  gameStarted: boolean = false;
  showLoadoutScreen: boolean = false;
  showLeaderboardsScreen: boolean = false;
  showEndScreen: boolean = false;
  showMapScreen: boolean = false;
  isNewPersonalBest: boolean = false;
  personalBest: number = 0;
  highScores: { name: string, score: number, date: string }[] = [];
  leaderboard: PucScoreEntry[] = [];
  leaderboardLoading: boolean = false;
  leaderboardError: string = '';
  selectedScreens: { [key: string]: string } = {
    'Leader Puc': '',
    'Ability 1': '',
    'Ability 2': ''
  };

  private isPaused: boolean = false;

  private explosions: Explosion[] = [];
  private stars: Star[] = [];
  private readonly EXPLOSION_DURATION = 600;
  private readonly EXPLOSION_PARTICLES = 18;
  private readonly STAR_COUNT = 50;
  private readonly STAR_MIN_SIZE = 2;
  private readonly STAR_MAX_SIZE = 5;
  private readonly STAR_MIN_SPEED = 0.5;
  private readonly STAR_MAX_SPEED = 2;

  // Skill gauges
  private leaderCharge: number = 0;
  private abilityCharges: { [slot: string]: number } = { 'Ability 1': 0, 'Ability 2': 0 };
  private activeBuffs: Buff[] = [];
  private skillBanner: { text: string; remaining: number } | null = null;

  // Map mode properties
  public isMapMode: boolean = false;
  public mapTargetScore: number = 10000;
  public mapStars: number = 0;
  private readonly STAR_THRESHOLDS = [0.3, 0.6, 1.0];
  /** Set by the map component so finished runs report their stars back. */
  public onLevelComplete: ((stars: number) => void) | null = null;

  private resizeHandler = () => this.fitToViewport();

  constructor(
    public fireService: FireService,
    private router: Router,
    private host: ElementRef<HTMLElement>,
    private zone: NgZone
  ) {
    this.hub.x = this.CANVAS_WIDTH / 2;
    this.hub.y = this.PLAY_AREA_Y;

    const imageNames = [
      'hitagi01.png',
      'nadeko01.png',
      'koyomi01.png',
      'tsubasa01.png',
      'shinobu01.png'
    ];

    imageNames.forEach((name, index) => {
      const img = new Image();
      img.src = `assets/pucpuc/${name}`;
      this.pucImages[index] = img;
    });

    // Preloaded once — drawing used to allocate a new Image() every frame,
    // which is why the loadout art never appeared on the canvas buttons.
    ['pucpuc1', 'pucpuc2', 'pucpuc3', 'pucpuc4', 'pucpuc5'].forEach(id => {
      const img = new Image();
      img.src = `assets/pucpuc/${this.getCharacterImageName(id)}01.png`;
      this.leaderImages[id] = img;
    });

    ['ability1', 'ability2', 'ability3', 'ability4'].forEach(id => {
      const img = new Image();
      img.src = `assets/ability/${id.replace('ability', '')}.png`;
      this.abilityImages[id] = img;
    });
  }

  ngOnInit(): void {
    this.centerImage = new Image();
    this.centerImage.src = 'assets/pucpuc/koyomi01.png';

    this.centerFeverImage = new Image();
    this.centerFeverImage.src = 'assets/pucpuc/koyomiFever.png';

    this.lastUpdateTime = Date.now();
    this.loadSavedLoadout();

    // Auth may not have resolved yet on first paint, so react to it rather than
    // reading currentUid once.
    this.fireService.auth.onAuthStateChanged(user => {
      if (user) this.refreshPersonalBest();
    });
  }

  ngAfterViewInit(): void {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.setupCanvasResolution();
    this.fitToViewport();
    window.addEventListener('resize', this.resizeHandler);

    // Bound exactly once. These used to be registered inside startGame(), so
    // every replay stacked another set of handlers on the same canvas.
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', () => this.handlePointerUp());
    this.canvas.addEventListener('mouseleave', () => this.handlePointerUp());
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handlePointerDown(this.getTouchPosition(e.touches[0]));
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.handlePointerUp();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.handlePointerMove(this.getTouchPosition(e.touches[0]));
    }, { passive: false });

    this.draw();
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
    window.removeEventListener('resize', this.resizeHandler);
  }

  // ----- Layout ---------------------------------------------------------------

  /**
   * The game is authored against a fixed 600x1050 space. The backing store is
   * sized for the device pixel ratio so scaling it up stays crisp; all drawing
   * keeps using logical coordinates.
   */
  private setupCanvasResolution(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.CANVAS_WIDTH * dpr;
    this.canvas.height = this.CANVAS_HEIGHT * dpr;
    this.canvas.style.width = `${this.CANVAS_WIDTH}px`;
    this.canvas.style.height = `${this.CANVAS_HEIGHT}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Scales the whole board (canvas + DOM overlays) to fill the viewport. */
  private fitToViewport(): void {
    const scale = Math.min(
      window.innerWidth / this.CANVAS_WIDTH,
      window.innerHeight / this.CANVAS_HEIGHT
    );
    this.host.nativeElement.style.setProperty('--game-scale', `${scale}`);
  }

  // ----- Input ----------------------------------------------------------------

  /**
   * Converts a viewport point into logical board coordinates. The board is CSS
   * scaled, so the ratio between the element's rendered size and its logical
   * size has to be applied or every hit-test lands in the wrong place.
   */
  private toBoardPosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (this.CANVAS_WIDTH / rect.width),
      y: (clientY - rect.top) * (this.CANVAS_HEIGHT / rect.height)
    };
  }

  private getMousePosition(event: MouseEvent): { x: number; y: number } {
    return this.toBoardPosition(event.clientX, event.clientY);
  }

  private getTouchPosition(touch: Touch | undefined): { x: number; y: number } {
    if (!touch) return this.mousePosition || { x: 0, y: 0 };
    return this.toBoardPosition(touch.clientX, touch.clientY);
  }

  private handleMouseDown(event: MouseEvent): void {
    this.handlePointerDown(this.getMousePosition(event));
  }

  private handleMouseMove(event: MouseEvent): void {
    this.handlePointerMove(this.getMousePosition(event));
  }

  private handlePointerDown(point: { x: number; y: number }): void {
    if (!this.gameStarted) return;

    if (this.hitTest(this.getPauseButtonRect(), point)) {
      this.togglePause();
      return;
    }

    if (this.isPaused) return;

    // Skill buttons sit below the play area and fire when their gauge is full.
    const rects = this.getSkillButtonRects();
    for (const slot of Object.keys(rects) as SkillSlot[]) {
      if (this.hitTest(rects[slot], point)) {
        this.activateSkill(slot);
        return;
      }
    }

    this.isMouseDown = true;
    this.mousePosition = point;

    const clickedPuc = this.findPucAtPosition(point.x, point.y);
    if (clickedPuc) {
      this.startChain(clickedPuc);
    }
  }

  private handlePointerUp(): void {
    if (!this.isMouseDown) return;
    this.isMouseDown = false;
    this.mousePosition = null;

    if (this.isPaused) {
      this.clearSelection();
      return;
    }

    if (this.selectedPucs.length > 0) {
      this.removeSelectedPucs();
    }
  }

  private handlePointerMove(point: { x: number; y: number }): void {
    if (this.isPaused) return;

    this.mousePosition = point;
    if (!this.isMouseDown || this.selectedPucs.length === 0) return;

    const hovered = this.findChainTargetAt(point.x, point.y);
    if (hovered && this.canExtendChain(hovered)) {
      this.addToChain(hovered);
    }
  }

  private hitTest(rect: Rect, point: { x: number; y: number }): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.w &&
           point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  private findPucAtPosition(x: number, y: number): Puc | null {
    for (const puc of this.pucs) {
      if (puc.removing || puc.combining) continue;
      const distance = Math.hypot(puc.x - x, puc.y - y);
      if (distance <= this.PUC_RADIUS * this.tierScale(puc)) {
        return puc;
      }
    }
    return null;
  }

  private tierScale(puc: Puc): number {
    return Math.min(this.MAX_VISUAL_SIZE, Math.pow(this.TIER_SCALE_FACTOR, puc.tier - 1));
  }

  private startChain(puc: Puc): void {
    this.clearSelection();
    puc.selected = true;
    this.selectedPucs.push(puc);
  }

  private addToChain(node: Puc): void {
    if (!this.canExtendChain(node)) return;

    // The hub is a waypoint, not a link in the chain, so it is never marked
    // selected and may be passed through more than once.
    if (!node.isHub) {
      node.selected = true;
    }
    this.selectedPucs.push(node);
  }

  private areAdjacent(puc1: Puc, puc2: Puc): boolean {
    const distance = Math.hypot(puc1.x - puc2.x, puc1.y - puc2.y);
    const averageScale = (this.tierScale(puc1) + this.tierScale(puc2)) / 2;

    return puc1.type === puc2.type &&
           distance <= this.PUC_RADIUS * this.CONNECTION_RANGE * this.linkRangeMultiplier * averageScale;
  }

  /** How far from the centre a puc can be and still reach the hub. */
  private canReachHub(puc: Puc): boolean {
    const reach = this.CENTER_RADIUS +
                  this.PUC_RADIUS * this.CONNECTION_RANGE * this.linkRangeMultiplier * this.tierScale(puc);
    return Math.hypot(puc.x - this.hub.x, puc.y - this.hub.y) <= reach;
  }

  /** The colour a chain is locked to, taken from its first real puc. */
  private chainType(): number {
    const first = this.selectedPucs.find(node => !node.isHub);
    return first ? first.type : -1;
  }

  private isOverHub(x: number, y: number): boolean {
    return Math.hypot(x - this.hub.x, y - this.hub.y) <= this.CENTER_RADIUS;
  }

  /** Hub takes priority: it sits underneath the centre art. */
  private findChainTargetAt(x: number, y: number): Puc | null {
    if (this.selectedPucs.length > 0 && this.isOverHub(x, y)) {
      return this.hub;
    }
    return this.findPucAtPosition(x, y);
  }

  /** Whether `node` may extend the current chain. */
  private canExtendChain(node: Puc): boolean {
    if (this.selectedPucs.length === 0) return false;

    const last = this.selectedPucs[this.selectedPucs.length - 1];

    if (node.isHub) {
      // Entering the middle: only from a real puc close enough to reach it.
      return !last.isHub && this.canReachHub(last);
    }

    if (node.selected) return false;

    if (last.isHub) {
      // Leaving the middle: any puc of the chain's colour within reach, which
      // is what lets a chain cross from one side of the board to the other.
      return node.type === this.chainType() && this.canReachHub(node);
    }

    return node.type === last.type && this.areAdjacent(last, node);
  }

  private clearSelection(): void {
    this.selectedPucs.forEach(puc => puc.selected = false);
    this.selectedPucs = [];
  }

  // ----- Chain resolution -----------------------------------------------------

  /** Single funnel for scoring, so fever and every skill gauge charge together. */
  private awardPoints(points: number): void {
    const rounded = Math.floor(points);
    this.score += rounded;

    this.leaderCharge = Math.min(LEADER_CHARGE_MAX, this.leaderCharge + rounded);
    for (const slot of ['Ability 1', 'Ability 2']) {
      this.abilityCharges[slot] = Math.min(ABILITY_CHARGE_MAX, this.abilityCharges[slot] + rounded);
    }

    if (!this.feverMode) {
      this.feverGauge = Math.min(this.FEVER_THRESHOLD, this.feverGauge + Math.max(0.5, rounded / 2));
      if (this.feverGauge >= this.FEVER_THRESHOLD) {
        this.activateFeverMode();
      }
    }
  }

  private removeSelectedPucs(): void {
    // The hub scores nothing and is never consumed — drop it before resolving.
    const chain = this.selectedPucs.filter(node => !node.isHub);
    const usedHub = chain.length !== this.selectedPucs.length;
    const count = chain.length;

    if (count < 1) {
      this.clearSelection();
      return;
    }

    // Routing a lone puc into the middle isn't a match — it should do nothing,
    // not pop the puc the way a plain single tap does.
    if (count === 1 && usedHub) {
      this.clearSelection();
      return;
    }

    if (count > 1) {
      this.comboCount++;
      this.lastComboTime = Date.now();
    }

    let totalPoints = 0;
    for (const puc of chain) {
      totalPoints += 10 * (1 + ((puc.tier - 1) * 0.1));
    }

    if (count > 1) {
      totalPoints *= Math.min(this.MAX_CHAIN_MULTIPLIER, 1 + ((count - 1) * 0.25));
    } else {
      totalPoints *= this.SINGLE_TAP_POINT_MULTIPLIER;
    }

    if (this.feverMode) {
      totalPoints *= 2;
    }

    this.clearSelection();

    // A lone tap never resets a fuse — it pops the puc (or sets off an armed one).
    if (count === 1) {
      const puc = chain[0];
      if (puc.fuseRemaining !== undefined) {
        this.awardPoints(totalPoints);
        this.detonate(puc);
        return;
      }

      this.explosions.push(this.createExplosion(puc.x, puc.y, puc.color, this.PUC_RADIUS * 2));
      this.pucs = this.pucs.filter(p => p !== puc);
      this.spawnQueue += 1;
      this.awardPoints(totalPoints);
      return;
    }

    const totalTier = chain.reduce((sum, puc) => sum + puc.tier, 0);
    // Any armed puc in the chain keeps the merged puc armed — and the new fuse
    // starts from full, which is what keeps a chain alive.
    const inheritedFuse = chain.some(puc => puc.fuseRemaining !== undefined);
    const inheritedFusePoints = chain.reduce((sum, puc) => sum + (puc.fusePoints || 0), 0);
    const target = chain[count - 1];

    // Score lands now rather than on detonation, so repeatedly resetting the
    // fuse still pays out.
    this.awardPoints(totalPoints);

    const stagger = 40;
    const duration = 170;
    for (let i = 0; i < count - 1; i++) {
      const puc = chain[i];
      puc.combining = true;
      puc.combineElapsed = 0;
      puc.combineDelay = i * stagger;
      puc.combineDuration = duration;
      puc.startX = puc.x;
      puc.startY = puc.y;
      puc.targetX = target.x;
      puc.targetY = target.y;
    }

    this.pendingMerges.push({
      remaining: (count - 2) * stagger + duration,
      x: target.x,
      y: target.y,
      type: target.type,
      tier: Math.min(totalTier, this.MAX_TIER * 2),
      fuse: inheritedFuse || totalTier > this.EXPLOSION_THRESHOLD,
      fusePoints: inheritedFusePoints + Math.floor(totalPoints * 0.5),
      sources: chain
    });
  }

  private updatePendingMerges(dtMs: number): void {
    for (let i = this.pendingMerges.length - 1; i >= 0; i--) {
      const merge = this.pendingMerges[i];
      merge.remaining -= dtMs;
      if (merge.remaining > 0) continue;

      this.pendingMerges.splice(i, 1);
      this.pucs = this.pucs.filter(p => !merge.sources.includes(p));

      const merged: Puc = {
        x: merge.x,
        y: merge.y,
        vx: 0,
        vy: 0,
        type: merge.type,
        color: this.COLORS[merge.type],
        selected: false,
        image: this.pucImages[merge.type],
        tier: merge.tier,
        removing: false,
        scale: 1
      };

      if (merge.fuse) {
        merged.fuseRemaining = this.FUSE_DURATION;
        merged.fuseTotal = this.FUSE_DURATION;
        merged.fusePoints = merge.fusePoints;
      }

      this.pucs.push(merged);
      this.spawnQueue += Math.max(1, merge.sources.length - 1);
    }
  }

  private updateFuses(dtMs: number): void {
    for (const puc of this.pucs.slice()) {
      if (puc.fuseRemaining === undefined || puc.removing) continue;
      puc.fuseRemaining -= dtMs;
      if (puc.fuseRemaining <= 0) {
        this.detonate(puc);
      }
    }
  }

  /** Blows up an armed puc: pays its banked points and seeds nearby pucs. */
  private detonate(puc: Puc): void {
    if (!this.pucs.includes(puc)) return;

    this.awardPoints(puc.fusePoints || puc.tier * 5);

    this.explosions.push(this.createExplosion(puc.x, puc.y, puc.color, this.PUC_RADIUS * 5));

    const explosionRadius = this.PUC_RADIUS * 3;
    const affectedPucs = this.pucs.filter(other => {
      if (other === puc || other.removing) return false;
      return Math.hypot(other.x - puc.x, other.y - puc.y) <= explosionRadius;
    });

    const tierToDistribute = Math.floor(puc.tier / 2);
    if (affectedPucs.length > 0 && tierToDistribute > 0) {
      const tierPerPuc = Math.floor(tierToDistribute / affectedPucs.length);
      const remainingTier = tierToDistribute % affectedPucs.length;

      affectedPucs.forEach(other => {
        other.tier = Math.min(other.tier + tierPerPuc, this.MAX_TIER);
      });

      if (remainingTier > 0) {
        affectedPucs.sort((a, b) =>
          Math.hypot(a.x - puc.x, a.y - puc.y) - Math.hypot(b.x - puc.x, b.y - puc.y)
        );
        for (let i = 0; i < remainingTier && i < affectedPucs.length; i++) {
          affectedPucs[i].tier = Math.min(affectedPucs[i].tier + 1, this.MAX_TIER);
        }
      }
    }

    this.pucs = this.pucs.filter(p => p !== puc);
    this.selectedPucs = this.selectedPucs.filter(p => p !== puc);
    // One out, one in. Queueing two here grew the board by one per explosion.
    this.spawnQueue += 1;
  }

  /**
   * Failsafe for anything that adds pucs faster than the board sheds them
   * (the refill ability, mainly). Rather than silently deleting pucs, random
   * ones are given a short fuse so the overflow burns off visibly — and pays out.
   */
  private enforcePucLimit(): void {
    // Pucs already on their way out shouldn't count against the ceiling, or
    // this would arm a fresh batch every frame until the board emptied.
    const leaving = this.pucs.filter(puc => puc.fuseRemaining !== undefined || puc.combining).length;
    const excess = this.pucs.length - leaving - this.MAX_PUCS;
    if (excess <= 0) return;

    const candidates = this.pucs.filter(puc =>
      !puc.combining && !puc.selected && puc.fuseRemaining === undefined
    );

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let i = 0; i < Math.min(excess, candidates.length); i++) {
      const puc = candidates[i];
      // Staggered so the overflow pops as a cascade instead of one big flash.
      puc.fuseRemaining = 150 + Math.random() * 450;
      puc.fuseTotal = puc.fuseRemaining;
      puc.fusePoints = puc.tier * 2;
    }
  }

  private createExplosion(x: number, y: number, color: string, maxRadius: number): Explosion {
    const particles: Explosion['particles'] = [];
    for (let i = 0; i < this.EXPLOSION_PARTICLES; i++) {
      particles.push({
        angle: (i / this.EXPLOSION_PARTICLES) * Math.PI * 2 + Math.random() * 0.3,
        speed: 0.65 + Math.random() * 0.45,
        size: 2 + Math.random() * 2.5
      });
    }
    return { x, y, startTime: Date.now(), color, maxRadius, particles };
  }

  // ----- Skills ---------------------------------------------------------------

  private skillForSlot(slot: SkillSlot): SkillDef | null {
    const id = this.selectedScreens[slot];
    if (!id) return null;
    return slot === 'Leader Puc' ? (LEADER_SKILLS[id] || null) : (ABILITIES[id] || null);
  }

  private chargeForSlot(slot: SkillSlot): number {
    return slot === 'Leader Puc' ? this.leaderCharge : (this.abilityCharges[slot] || 0);
  }

  private chargeMaxForSlot(slot: SkillSlot): number {
    return slot === 'Leader Puc' ? LEADER_CHARGE_MAX : ABILITY_CHARGE_MAX;
  }

  private isSkillReady(slot: SkillSlot): boolean {
    return !!this.skillForSlot(slot) && this.chargeForSlot(slot) >= this.chargeMaxForSlot(slot);
  }

  private activateSkill(slot: SkillSlot): void {
    const skill = this.skillForSlot(slot);
    if (!skill || !this.isSkillReady(slot)) return;

    skill.apply(this);

    if (slot === 'Leader Puc') {
      this.leaderCharge = 0;
    } else {
      this.abilityCharges[slot] = 0;
    }

    this.skillBanner = { text: skill.name, remaining: 1400 };
  }

  // GameApi — the surface skill definitions act on. -----------------------------

  public allPucs(): Puc[] {
    return this.pucs;
  }

  public centre(): { x: number; y: number } {
    return { x: this.CANVAS_WIDTH / 2, y: this.PLAY_AREA_Y };
  }

  public playRadius(): number {
    return this.PLAY_RADIUS;
  }

  public bumpTier(puc: Puc, amount: number): void {
    puc.tier = Math.min(this.MAX_TIER, puc.tier + amount);
    if (puc.tier > this.EXPLOSION_THRESHOLD && puc.fuseRemaining === undefined) {
      this.arm(puc, this.FUSE_DURATION);
    }
  }

  public setType(puc: Puc, type: number): void {
    puc.type = type;
    puc.color = this.COLORS[type];
    puc.image = this.pucImages[type];
  }

  public arm(puc: Puc, fuseMs: number): void {
    puc.fuseRemaining = fuseMs;
    puc.fuseTotal = Math.max(fuseMs, 1);
    puc.fusePoints = puc.fusePoints || puc.tier * 5;
  }

  public move(puc: Puc, x: number, y: number): void {
    puc.x = x;
    puc.y = y;
    puc.vx = 0;
    puc.vy = 0;
  }

  public addLeaderCharge(amount: number): void {
    this.leaderCharge = Math.min(LEADER_CHARGE_MAX, this.leaderCharge + amount);
  }

  public leaderChargeMax(): number {
    return LEADER_CHARGE_MAX;
  }

  public setLinkRangeMultiplier(multiplier: number): void {
    this.linkRangeMultiplier = multiplier;
  }

  public addBuff(buff: Buff): void {
    this.activeBuffs = this.activeBuffs.filter(b => b.id !== buff.id);
    this.activeBuffs.push(buff);
  }

  public leaderType(): number {
    const id = this.selectedScreens['Leader Puc'];
    const order = ['pucpuc1', 'pucpuc3', 'pucpuc2', 'pucpuc5', 'pucpuc4'];
    return order.indexOf(id);
  }

  public typeCount(): number {
    return this.COLORS.length;
  }

  private updateBuffs(dtMs: number): void {
    for (let i = this.activeBuffs.length - 1; i >= 0; i--) {
      const buff = this.activeBuffs[i];
      buff.remaining -= dtMs;

      if (buff.spawnIntervalMs) {
        buff.spawnCooldown = (buff.spawnCooldown || 0) - dtMs;
        if (buff.spawnCooldown <= 0) {
          this.spawnQueue += 1;
          buff.spawnCooldown = buff.spawnIntervalMs;
        }
      }

      if (buff.remaining <= 0) {
        this.activeBuffs.splice(i, 1);
      }
    }
  }

  private get spawnTierBonus(): number {
    return this.activeBuffs.reduce((sum, buff) => sum + (buff.spawnTierBonus || 0), 0);
  }

  // ----- Game lifecycle -------------------------------------------------------

  private initializeGame(): void {
    this.pucs = [];
    this.selectedPucs = [];
    this.pendingMerges = [];
    this.score = 0;
    this.timeLeft = this.GAME_DURATION;
    this.feverMode = false;
    this.feverGauge = 0;
    this.feverTimeLeft = 0;
    this.comboCount = 0;
    this.lastComboTime = 0;
    this.isPaused = false;
    this.lastUpdateTime = Date.now();
    this.isNewPersonalBest = false;

    this.leaderCharge = 0;
    this.abilityCharges = { 'Ability 1': 0, 'Ability 2': 0 };
    this.activeBuffs = [];
    this.skillBanner = null;
    this.linkRangeMultiplier = 1;
    this.spawnQueue = 0;

    for (let i = 0; i < this.INITIAL_PUCS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = this.CENTER_RADIUS + this.PUC_RADIUS +
                     Math.random() * (this.PLAY_RADIUS - this.CENTER_RADIUS - this.PUC_RADIUS * 2);
      this.pucs.push({
        x: this.CANVAS_WIDTH / 2 + Math.cos(angle) * radius,
        y: this.PLAY_AREA_Y + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        type: 0,
        color: this.COLORS[0],
        selected: false,
        tier: this.rollTier(),
        scale: 1
      });
      this.setType(this.pucs[i], Math.floor(Math.random() * this.COLORS.length));
    }

    this.explosions = [];
    this.stars = [];
    for (let i = 0; i < this.STAR_COUNT; i++) {
      this.stars.push(this.createStar());
    }
  }

  private rollTier(): number {
    const chance = Math.random();
    if (chance < 0.4) return 1;
    if (chance < 0.7) return 2;
    if (chance < 0.85) return 3;
    if (chance < 0.95) return 4;
    return 5;
  }

  private createStar(): Star {
    return {
      x: Math.random() * this.CANVAS_WIDTH,
      y: Math.random() * this.CANVAS_HEIGHT,
      size: this.STAR_MIN_SIZE + Math.random() * (this.STAR_MAX_SIZE - this.STAR_MIN_SIZE),
      phase: Math.random() * Math.PI * 2,
      speed: this.STAR_MIN_SPEED + Math.random() * (this.STAR_MAX_SPEED - this.STAR_MIN_SPEED)
    };
  }

  /** Free Play always leaves map mode, which used to stick after a story run. */
  startFreePlay(): void {
    this.isMapMode = false;
    this.onLevelComplete = null;
    this.startGame();
  }

  startGame(): void {
    if (!this.isLoadoutComplete()) {
      return;
    }

    this.showEndScreen = false;
    this.gameStarted = true;
    this.initializeGame();
    this.startGameLoop();
  }

  private startGameLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    // Outside Angular: this runs at 60fps and must not trigger change detection.
    this.zone.runOutsideAngular(() => {
      const animate = () => {
        this.updateGame();
        this.animationId = requestAnimationFrame(animate);
      };
      this.animationId = requestAnimationFrame(animate);
    });
  }

  private updateGame(): void {
    const currentTime = Date.now();
    // Clamped so a backgrounded tab doesn't teleport the simulation forward.
    const dt = Math.min(0.05, (currentTime - this.lastUpdateTime) / 1000);
    this.lastUpdateTime = currentTime;

    if (this.isPaused || !this.gameStarted) {
      this.draw();
      return;
    }

    const dtMs = dt * 1000;

    if (this.comboCount > 0 && currentTime - this.lastComboTime > 3000) {
      this.comboCount = 0;
    }

    if (this.skillBanner) {
      this.skillBanner.remaining -= dtMs;
      if (this.skillBanner.remaining <= 0) this.skillBanner = null;
    }

    this.updateFeverMode(dtMs);
    this.updateBuffs(dtMs);
    this.updatePendingMerges(dtMs);
    this.updateFuses(dtMs);
    this.enforcePucLimit();

    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.gameOver();
        return;
      }
    }

    this.updatePhysics(dt, dtMs);
    this.draw();
  }

  private activateFeverMode(): void {
    if (this.feverMode) return;
    this.feverMode = true;
    this.feverTimeLeft = this.FEVER_DURATION;
    this.feverGauge = this.FEVER_THRESHOLD;
    this.scoreAtFeverStart = this.score;
  }

  private updateFeverMode(dtMs: number): void {
    if (!this.feverMode) return;

    this.feverTimeLeft = Math.max(0, this.feverTimeLeft - dtMs);
    this.feverGauge = (this.feverTimeLeft / this.FEVER_DURATION) * this.FEVER_THRESHOLD;

    if (this.feverTimeLeft <= 0) {
      this.feverMode = false;
      this.feverGauge = 0;
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.clearSelection();
      this.isMouseDown = false;
    }
    // No timestamp bookkeeping needed: every timer is driven by the frame delta,
    // and updateGame consumes the delta before the pause check.
  }

  private async gameOver(): Promise<void> {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    this.gameStarted = false;

    if (this.isMapMode) {
      // Show what this run actually earned, not the level's previous best.
      this.mapStars = this.earnedStars();
      if (this.onLevelComplete) {
        this.onLevelComplete(this.mapStars);
      }
    }

    // Back inside Angular: the loop ran outside the zone, so the end screen
    // would not render without this.
    this.zone.run(() => {
      this.showEndScreen = true;
    });

    await this.persistScore();
  }

  private earnedStars(): number {
    const progress = this.score / this.mapTargetScore;
    let stars = 0;
    for (const threshold of this.STAR_THRESHOLDS) {
      if (progress >= threshold) stars++;
    }
    return stars;
  }

  private async persistScore(): Promise<void> {
    // localStorage keeps working signed-out, and doubles as an offline mirror.
    this.saveLocalHighScore();

    if (!this.fireService.currentUid) return;

    try {
      const isBest = await this.fireService.savePucScore(this.score);
      this.zone.run(() => {
        this.isNewPersonalBest = isBest;
        if (isBest) this.personalBest = this.score;
      });
    } catch (error) {
      console.error('Could not save Puc Puc score:', error);
    }
  }

  private saveLocalHighScore(): void {
    this.loadLocalHighScores();
    this.highScores.push({
      name: 'You',
      score: this.score,
      date: new Date().toISOString().split('T')[0]
    });
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 5);
    localStorage.setItem('pucpucHighScores', JSON.stringify(this.highScores));
  }

  private loadLocalHighScores(): void {
    const savedScores = localStorage.getItem('pucpucHighScores');
    if (savedScores) {
      try {
        this.highScores = JSON.parse(savedScores);
        this.highScores.sort((a, b) => b.score - a.score);
        return;
      } catch {
        // fall through to an empty board
      }
    }
    this.highScores = [];
  }

  private async refreshPersonalBest(): Promise<void> {
    if (!this.fireService.currentUid) return;
    try {
      this.personalBest = await this.fireService.getPucPersonalBest();
    } catch (error) {
      console.error('Could not load personal best:', error);
    }
  }

  restartGame(): void {
    this.showEndScreen = false;
    this.startGame();
  }

  goToMainMenu(): void {
    this.showEndScreen = false;
    this.gameStarted = false;
    this.isMapMode = false;
    this.onLevelComplete = null;
    this.draw();
  }

  exitGame(): void {
    this.router.navigate(['/messageApp']);
  }

  // ----- Physics --------------------------------------------------------------

  private updatePhysics(dt: number, dtMs: number): void {
    const centerX = this.CANVAS_WIDTH / 2;
    const centerY = this.PLAY_AREA_Y;
    // Forces were tuned at 60fps, so scale them by how far this frame is from that.
    const step = dt * 60;

    if (this.spawnQueue > 0) {
      // Never queue past the ceiling — a backed-up queue used to keep spawning
      // long after the board was full.
      const room = Math.max(0, this.MAX_PUCS - this.pucs.length);
      const spawnsThisFrame = Math.min(this.spawnQueue, 2, room);
      for (let i = 0; i < spawnsThisFrame; i++) {
        this.spawnNewPuc();
      }
      this.spawnQueue -= spawnsThisFrame;
      if (room === 0) {
        this.spawnQueue = 0;
      }
    }

    for (const puc of this.pucs.slice()) {
      if (puc.combining) {
        this.updateCombineTween(puc, dtMs);
        continue;
      }

      const dx = centerX - puc.x;
      const dy = centerY - puc.y;
      // Floored so the pull doesn't blow up as a puc approaches the centre.
      const distance = Math.max(this.CENTER_RADIUS, Math.hypot(dx, dy));

      const attractionMultiplier = 1 / (distance * 0.1);
      puc.vx += dx * this.ATTRACTION_FORCE * attractionMultiplier * step;
      puc.vy += dy * this.ATTRACTION_FORCE * attractionMultiplier * step;

      const damping = Math.pow(this.DAMPING, step);
      puc.vx *= damping;
      puc.vy *= damping;

      const speed = Math.hypot(puc.vx, puc.vy);
      if (speed > this.MAX_SPEED) {
        puc.vx = (puc.vx / speed) * this.MAX_SPEED;
        puc.vy = (puc.vy / speed) * this.MAX_SPEED;
      }
    }

    const active = this.pucs.filter(puc => !puc.combining && !puc.removing);

    for (let i = 0; i < active.length; i++) {
      const puc1 = active[i];

      for (let j = i + 1; j < active.length; j++) {
        const puc2 = active[j];

        const collisionDx = puc2.x - puc1.x;
        const collisionDy = puc2.y - puc1.y;
        const collisionDist = Math.hypot(collisionDx, collisionDy) || 0.0001;

        const puc1Scale = this.tierScale(puc1);
        const puc2Scale = this.tierScale(puc2);
        const minDist = this.PUC_RADIUS * 2 * ((puc1Scale + puc2Scale) / 2);

        if (collisionDist < minDist) {
          const angle = Math.atan2(collisionDy, collisionDx);
          const overlap = minDist - collisionDist;

          const totalScale = puc1Scale + puc2Scale;
          const moveX = Math.cos(angle);
          const moveY = Math.sin(angle);
          // Relaxed rather than fully separating in one frame: with a crowded
          // board, 100% correction makes neighbours shove each other back and
          // forth. The remaining overlap clears over the next few frames.
          const correction = overlap * this.COLLISION_RELAXATION;

          puc1.x -= moveX * (puc2Scale / totalScale) * correction;
          puc1.y -= moveY * (puc2Scale / totalScale) * correction;
          puc2.x += moveX * (puc1Scale / totalScale) * correction;
          puc2.y += moveY * (puc1Scale / totalScale) * correction;

          const normalX = collisionDx / collisionDist;
          const normalY = collisionDy / collisionDist;

          const relativeSpeed = (puc2.vx - puc1.vx) * normalX + (puc2.vy - puc1.vy) * normalY;
          const impulse = relativeSpeed * 0.5;

          puc1.vx += normalX * impulse * (puc2Scale / totalScale);
          puc1.vy += normalY * impulse * (puc2Scale / totalScale);
          puc2.vx -= normalX * impulse * (puc1Scale / totalScale);
          puc2.vy -= normalY * impulse * (puc1Scale / totalScale);
        }
      }

      let newX = puc1.x + puc1.vx * step;
      let newY = puc1.y + puc1.vy * step;

      const radius = this.PUC_RADIUS * this.tierScale(puc1);
      const centerDist = Math.hypot(newX - centerX, newY - centerY);

      const innerLimit = this.CENTER_RADIUS + radius;
      if (centerDist < innerLimit) {
        const bounceAngle = Math.atan2(newY - centerY, newX - centerX);
        newX = centerX + innerLimit * Math.cos(bounceAngle);
        newY = centerY + innerLimit * Math.sin(bounceAngle);
        puc1.vx *= -0.5;
        puc1.vy *= -0.5;
      }

      // No outer wall. It used to fight the overlap resolution: big pucs were
      // pushed apart, clamped back inside the ring, and pushed again, which is
      // what made a crowded board jitter. The centre pull is constant, so pucs
      // that drift past the ring always come home on their own.

      // The one hard edge: never let a puc reach the gauges and skill buttons.
      const floor = this.PLAY_FLOOR - radius;
      if (newY > floor) {
        newY = floor;
        if (puc1.vy > 0) puc1.vy *= -0.35;
      }

      puc1.x = newX;
      puc1.y = newY;
    }
  }

  /**
   * Eased travel from where the puc started to the merge point. The old version
   * only ran for pucs flagged `removing` — which combining pucs never were — so
   * chains vanished instantly instead of animating.
   */
  private updateCombineTween(puc: Puc, dtMs: number): void {
    puc.combineElapsed = (puc.combineElapsed || 0) + dtMs;

    const elapsed = puc.combineElapsed - (puc.combineDelay || 0);
    if (elapsed <= 0) return;

    const duration = puc.combineDuration || 170;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);

    const startX = puc.startX ?? puc.x;
    const startY = puc.startY ?? puc.y;
    puc.x = startX + ((puc.targetX ?? startX) - startX) * eased;
    puc.y = startY + ((puc.targetY ?? startY) - startY) * eased;
    puc.scale = 1 - (eased * 0.55);
  }

  private spawnNewPuc(): void {
    // Spawned beyond the ring, where the clip hides them, and thrown inward so
    // they cross the edge and fall into play instead of popping into existence.
    // The upper arc only: it keeps them clear of the floor and reads as falling.
    const angle = Math.PI + Math.random() * Math.PI;
    const spawnRadius = this.PLAY_RADIUS * (1.15 + Math.random() * 0.25);

    const x = this.CANVAS_WIDTH / 2 + Math.cos(angle) * spawnRadius;
    const y = this.PLAY_AREA_Y + Math.sin(angle) * spawnRadius;

    const inwardX = (this.CANVAS_WIDTH / 2 - x) / spawnRadius;
    const inwardY = (this.PLAY_AREA_Y - y) / spawnRadius;
    const entrySpeed = 1.4 + Math.random() * 0.5;

    const puc: Puc = {
      x,
      y,
      vx: inwardX * entrySpeed,
      vy: inwardY * entrySpeed,
      type: 0,
      color: this.COLORS[0],
      selected: false,
      tier: Math.min(this.MAX_TIER, this.rollTier() + this.spawnTierBonus),
      removing: false,
      scale: 1
    };

    this.setType(puc, Math.floor(Math.random() * this.COLORS.length));
    this.pucs.push(puc);
  }

  // ----- Drawing --------------------------------------------------------------

  private draw(): void {
    if (!this.ctx) return;

    const bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#FFF5F5');
    bgGradient.addColorStop(1, '#FFF0F0');
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

    this.ctx.beginPath();
    this.ctx.arc(this.CANVAS_WIDTH / 2, this.PLAY_AREA_Y, this.PLAY_RADIUS, 0, Math.PI * 2);

    if (this.feverMode) {
      this.ctx.fillStyle = 'rgba(32, 73, 151, 0.4)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(32, 73, 151, 0.4)';
    } else {
      this.ctx.strokeStyle = '#FFCDD2';
    }
    this.ctx.lineWidth = 5;
    this.ctx.stroke();

    if (this.feverMode) {
      this.drawStarfield();
    }

    // Everything on the board is clipped to the ring. Pucs that drift outside
    // keep moving and stay part of the simulation, they just aren't rendered
    // past the edge — they read as having slipped behind it.
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(
      this.CANVAS_WIDTH / 2,
      this.PLAY_AREA_Y,
      this.PLAY_RADIUS - 2,
      0,
      Math.PI * 2
    );
    this.ctx.clip();

    this.drawHub();

    for (const puc of this.pucs) {
      this.drawPuc(puc);
    }

    this.drawConnections();
    this.drawExplosions();

    this.ctx.restore();

    this.drawUI();
  }

  /** The centre node: art plus a highlight while a chain is routed through it. */
  private drawHub(): void {
    const inChain = this.selectedPucs.some(node => node.isHub);
    const reachable = this.selectedPucs.length > 0 &&
                      this.canExtendChain(this.hub);

    if (inChain || reachable) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(this.hub.x, this.hub.y, this.CENTER_RADIUS + 4, 0, Math.PI * 2);
      this.ctx.strokeStyle = inChain
        ? 'rgba(255, 255, 255, 0.9)'
        : `rgba(255, 255, 255, ${(0.3 + pulse * 0.35).toFixed(3)})`;
      this.ctx.lineWidth = inChain ? 4 : 3;
      this.ctx.stroke();
      this.ctx.restore();
    }

    const centerArt = this.feverMode ? this.centerFeverImage : this.centerImage;
    if (!this.isImageReady(centerArt)) return;

    this.ctx.save();
    // Always slightly see-through, chained or not.
    this.ctx.globalAlpha = 0.5;
    this.ctx.drawImage(
      centerArt!,
      this.hub.x - this.CENTER_IMAGE_SIZE / 2,
      this.hub.y + this.CENTER_Y_VISUAL_OFFSET - this.CENTER_IMAGE_SIZE / 2,
      this.CENTER_IMAGE_SIZE,
      this.CENTER_IMAGE_SIZE
    );
    this.ctx.restore();
  }

  private isImageReady(img: HTMLImageElement | null | undefined): boolean {
    return !!img && img.complete && img.naturalWidth > 0;
  }

  private drawStarfield(): void {
    const time = Date.now() / 1000;
    this.ctx.save();
    for (const star of this.stars) {
      // Kept strictly positive; the old formula dipped below zero and flickered.
      const opacity = 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(173, 216, 230, ${opacity.toFixed(3)})`;
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  private drawPuc(puc: Puc): void {
    if (!this.isImageReady(puc.image)) return;

    let scale = puc.scale ?? 1;
    let opacity = 1;
    let glow = 0;

    if (puc.fuseRemaining !== undefined && puc.fuseTotal) {
      // Urgency ramps the pulse from a calm 2.5Hz up to 8Hz right before the
      // blast, and the alpha never drops far enough to read as a strobe.
      const remaining = Math.max(0, puc.fuseRemaining) / puc.fuseTotal;
      const urgency = 1 - remaining;
      const frequency = 2.5 + urgency * 5.5;
      const phase = (Date.now() / 1000) * frequency * Math.PI * 2;
      const wave = 0.5 + 0.5 * Math.cos(phase);

      opacity = 0.68 + 0.32 * wave;
      scale *= 1 + 0.07 * wave;
      glow = wave;
    }

    const tierScale = this.tierScale(puc);
    const size = this.PUC_RADIUS * 2 * scale * this.PUC_DISPLAY_SCALE * tierScale;

    this.ctx.save();
    this.ctx.translate(puc.x, puc.y);
    this.ctx.globalAlpha = opacity;

    if (glow > 0) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, this.PUC_RADIUS * tierScale * (1.25 + glow * 0.2), 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(255, 240, 180, ${(0.35 + glow * 0.45).toFixed(3)})`;
      this.ctx.lineWidth = 3 + glow * 3;
      this.ctx.stroke();
    }

    if (puc.selected) {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, this.PUC_RADIUS * 1.2 * tierScale, 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }

    this.ctx.drawImage(puc.image!, -size / 2, -size / 2, size, size);

    if (puc.fuseRemaining !== undefined) {
      this.ctx.font = `bold ${14 + Math.min(puc.tier, 10)}px Arial`;
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(puc.tier.toString(), 0, 0);
      this.ctx.fillText(puc.tier.toString(), 0, 0);
    }

    this.ctx.restore();
  }

  private drawConnections(): void {
    if (this.selectedPucs.length < 1) return;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 10;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const firstPuc = this.selectedPucs[0];
    this.ctx.moveTo(firstPuc.x, firstPuc.y);

    for (let i = 1; i < this.selectedPucs.length; i++) {
      this.ctx.lineTo(this.selectedPucs[i].x, this.selectedPucs[i].y);
    }

    if (this.isMouseDown && this.mousePosition) {
      const hovered = this.findChainTargetAt(this.mousePosition.x, this.mousePosition.y);
      if (hovered && this.canExtendChain(hovered)) {
        this.ctx.lineTo(hovered.x, hovered.y);
      }
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawExplosions(): void {
    const currentTime = Date.now();
    this.ctx.save();

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      const progress = Math.min(1, (currentTime - explosion.startTime) / this.EXPLOSION_DURATION);
      const eased = 1 - Math.pow(1 - progress, 3);
      const radius = Math.max(0.1, explosion.maxRadius * eased);
      const fade = 1 - progress;

      // Soft shockwave instead of the old hard-edged white disc.
      const gradient = this.ctx.createRadialGradient(
        explosion.x, explosion.y, radius * 0.2,
        explosion.x, explosion.y, radius
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${(0.45 * fade).toFixed(3)})`);
      gradient.addColorStop(0.6, `rgba(255, 240, 220, ${(0.22 * fade).toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      this.ctx.beginPath();
      this.ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${(0.5 * fade).toFixed(3)})`;
      this.ctx.lineWidth = 3 * fade;
      this.ctx.stroke();

      for (const particle of explosion.particles) {
        const distance = radius * particle.speed;
        this.ctx.beginPath();
        this.ctx.arc(
          explosion.x + Math.cos(particle.angle) * distance,
          explosion.y + Math.sin(particle.angle) * distance,
          particle.size * fade,
          0,
          Math.PI * 2
        );
        this.ctx.fillStyle = `rgba(255, 255, 255, ${(0.8 * fade).toFixed(3)})`;
        this.ctx.fill();
      }

      if (progress >= 1) {
        this.explosions.splice(i, 1);
      }
    }

    this.ctx.restore();
  }

  /** Correct 5-point star: 10 alternating vertices around the centre. */
  private drawStar(cx: number, cy: number, outerR: number, innerR: number, filled: boolean): void {
    this.ctx.save();
    this.ctx.beginPath();

    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI / 5) - Math.PI / 2;
      const radius = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.closePath();

    if (filled) {
      this.ctx.fillStyle = '#FFD700';
      this.ctx.fill();
    }
    this.ctx.strokeStyle = '#FFD700';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    this.ctx.restore();
  }

  private getPauseButtonRect(): Rect {
    // Fixed position in both modes — the map HUD moved down instead of pushing
    // this button into the progress bar.
    const size = 34;
    return { x: this.CANVAS_WIDTH - size - 20, y: this.HEADER_OFFSET + 16, w: size, h: size };
  }

  /** One source of truth shared by the renderer and the hit-test. */
  private getSkillButtonRects(): Record<SkillSlot, Rect> {
    const gaugeY = this.PLAY_AREA_Y + this.PLAY_RADIUS + 30;
    const buttonsY = gaugeY + 15 + 40;

    const abilityWidth = 140;
    const abilityHeight = 100;
    const spacing = 20;
    const startX = (this.CANVAS_WIDTH - (abilityWidth * 2 + spacing)) / 2;

    return {
      'Leader Puc': { x: 20, y: buttonsY, w: 100, h: 140 },
      'Ability 1': { x: startX, y: buttonsY + 20, w: abilityWidth, h: abilityHeight },
      'Ability 2': { x: startX + abilityWidth + spacing, y: buttonsY + 20, w: abilityWidth, h: abilityHeight }
    };
  }

  private drawUI(): void {
    this.ctx.save();

    this.ctx.font = 'bold 24px Arial';
    this.ctx.fillStyle = '#333333';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(`Score: ${this.score}`, 20, 40 + this.HEADER_OFFSET);

    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = Math.floor(this.timeLeft % 60);
    this.ctx.font = 'bold 36px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(
      `${minutes}:${seconds.toString().padStart(2, '0')}`,
      this.CANVAS_WIDTH / 2,
      40 + this.HEADER_OFFSET
    );

    this.ctx.restore();

    if (this.isMapMode) {
      this.drawMapObjective();
    }

    if (this.feverMode) {
      this.ctx.save();
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        `Fever: ${this.score - this.scoreAtFeverStart}`,
        this.CANVAS_WIDTH / 2,
        80 + this.HEADER_OFFSET
      );
      this.ctx.restore();
    }

    this.drawPauseButton();

    if (this.comboCount > 0) {
      this.ctx.save();
      this.ctx.font = 'bold 20px Arial';
      this.ctx.fillStyle = '#333333';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(
        `Combo: ${this.comboCount}`,
        this.CANVAS_WIDTH - 20,
        this.isMapMode ? 290 : 200
      );
      this.ctx.restore();
    }

    this.drawFeverGauge();
    this.drawSkillButtons();
    this.drawSkillBanner();

    if (this.isPaused) {
      this.drawPauseOverlay();
    }
  }

  private drawMapObjective(): void {
    const progress = Math.min(1, this.score / this.mapTargetScore);
    const barWidth = 200;
    const barHeight = 15;
    const barX = this.CANVAS_WIDTH - barWidth - 20;
    const barY = this.HEADER_OFFSET + 95;

    this.ctx.save();

    this.ctx.font = 'bold 20px Arial';
    this.ctx.fillStyle = '#FF6B6B';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(`Target: ${this.mapTargetScore}`, this.CANVAS_WIDTH - 20, barY - 10);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    this.ctx.fillStyle = '#FF6B6B';
    this.ctx.fillRect(barX, barY, barWidth * progress, barHeight);

    const starRadius = 10;
    const starSpacing = 30;
    const starsStartX = barX + barWidth / 2 - starSpacing;
    const starY = barY + barHeight + 18;

    for (let i = 0; i < 3; i++) {
      this.drawStar(
        starsStartX + i * starSpacing,
        starY,
        starRadius,
        starRadius / 2.2,
        progress >= this.STAR_THRESHOLDS[i]
      );
    }

    this.ctx.restore();
  }

  private drawPauseButton(): void {
    const rect = this.getPauseButtonRect();

    this.ctx.save();
    this.ctx.fillStyle = this.isPaused ? 'rgba(255, 107, 107, 0.7)' : 'rgba(255, 255, 255, 0.7)';
    this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    this.ctx.strokeStyle = this.isPaused ? '#FF6B6B' : '#333333';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    this.ctx.fillStyle = this.isPaused ? '#FF6B6B' : '#333333';
    if (this.isPaused) {
      this.ctx.beginPath();
      this.ctx.moveTo(rect.x + 11, rect.y + 6);
      this.ctx.lineTo(rect.x + 11, rect.y + rect.h - 6);
      this.ctx.lineTo(rect.x + rect.w - 7, rect.y + rect.h / 2);
      this.ctx.closePath();
      this.ctx.fill();
    } else {
      this.ctx.fillRect(rect.x + 9, rect.y + 6, 5, rect.h - 12);
      this.ctx.fillRect(rect.x + 20, rect.y + 6, 5, rect.h - 12);
    }
    this.ctx.restore();
  }

  private drawFeverGauge(): void {
    const gaugeWidth = 200;
    const gaugeHeight = 15;
    const gaugeX = (this.CANVAS_WIDTH - gaugeWidth) / 2;
    const gaugeY = this.PLAY_AREA_Y + this.PLAY_RADIUS + 30;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    if (this.feverGauge > 0) {
      this.ctx.fillStyle = this.feverMode ? '#FF6B6B' : '#FFD700';
      this.ctx.fillRect(gaugeX, gaugeY, (this.feverGauge / this.FEVER_THRESHOLD) * gaugeWidth, gaugeHeight);
    }

    if (this.feverMode) {
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        `FEVER! x2 (${Math.ceil(this.feverTimeLeft / 1000)}s)`,
        this.CANVAS_WIDTH / 2,
        gaugeY - 10
      );
    }
    this.ctx.restore();
  }

  private drawSkillButtons(): void {
    const rects = this.getSkillButtonRects();
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 220);

    (Object.keys(rects) as SkillSlot[]).forEach(slot => {
      const rect = rects[slot];
      const id = this.selectedScreens[slot];
      const charge = this.chargeForSlot(slot);
      const chargeMax = this.chargeMaxForSlot(slot);
      const ratio = Math.min(1, charge / chargeMax);
      const ready = this.isSkillReady(slot);

      this.ctx.save();

      this.ctx.fillStyle = 'rgba(70, 40, 40, 0.55)';
      this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      // Charge fills the box from the bottom up.
      const fillHeight = rect.h * ratio;
      this.ctx.fillStyle = ready ? 'rgba(255, 215, 0, 0.55)' : 'rgba(255, 107, 107, 0.65)';
      this.ctx.fillRect(rect.x, rect.y + rect.h - fillHeight, rect.w, fillHeight);

      const art = slot === 'Leader Puc' ? this.leaderImages[id] : this.abilityImages[id];
      if (this.isImageReady(art)) {
        this.ctx.save();
        this.ctx.globalAlpha = ready ? 1 : 0.75;
        if (slot === 'Leader Puc') {
          const size = rect.w * 0.7;
          this.ctx.drawImage(art, rect.x + (rect.w - size) / 2, rect.y + 12, size, size);
        } else {
          this.ctx.drawImage(art, rect.x + 10, rect.y + 8, rect.w - 20, rect.h - 32);
        }
        this.ctx.restore();
      }

      this.ctx.strokeStyle = ready ? `rgba(255, 215, 0, ${(0.55 + pulse * 0.45).toFixed(3)})` : '#FF6B6B';
      this.ctx.lineWidth = ready ? 3 + pulse * 2 : 2;
      this.ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'alphabetic';
      this.ctx.fillStyle = 'white';

      if (!id) {
        this.ctx.font = 'bold 15px Arial';
        this.ctx.fillText(slot === 'Leader Puc' ? 'Leader' : slot, rect.x + rect.w / 2, rect.y + rect.h / 2);
      } else if (ready) {
        this.ctx.fillStyle = '#FFF3B0';
        this.ctx.fillText('READY!', rect.x + rect.w / 2, rect.y + rect.h - 8);
      } else {
        this.ctx.fillText(
          `${Math.floor(ratio * 100)}%`,
          rect.x + rect.w / 2,
          rect.y + rect.h - 8
        );
      }

      this.ctx.restore();
    });
  }

  private drawSkillBanner(): void {
    if (!this.skillBanner) return;

    const fade = Math.min(1, this.skillBanner.remaining / 400);
    this.ctx.save();
    this.ctx.globalAlpha = fade;
    this.ctx.font = 'bold 30px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.lineWidth = 5;
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    this.ctx.fillStyle = '#FFD700';
    this.ctx.strokeText(this.skillBanner.text, this.CANVAS_WIDTH / 2, this.PLAY_AREA_Y - this.PLAY_RADIUS - 20);
    this.ctx.fillText(this.skillBanner.text, this.CANVAS_WIDTH / 2, this.PLAY_AREA_Y - this.PLAY_RADIUS - 20);
    this.ctx.restore();
  }

  private drawPauseOverlay(): void {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

    const centerX = this.CANVAS_WIDTH / 2;
    const centerY = this.CANVAS_HEIGHT / 2;
    const iconSize = 100;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.fillRect(centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
    this.ctx.strokeStyle = '#FF6B6B';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(centerX - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);

    this.ctx.fillStyle = '#FF6B6B';
    this.ctx.fillRect(centerX - 30, centerY - 30, 20, 60);
    this.ctx.fillRect(centerX + 10, centerY - 30, 20, 60);

    this.ctx.font = 'bold 22px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillText('PAUSED', centerX, centerY + iconSize);
    this.ctx.restore();
  }

  // ----- Loadout / menus ------------------------------------------------------

  openLoadout(): void {
    this.showLoadoutScreen = true;
  }

  closeLoadout(): void {
    this.showLoadoutScreen = false;
  }

  confirmLoadout(): void {
    this.closeLoadout();
  }

  selectScreen(screenName: string, option: string): void {
    if (screenName === 'Ability 1' && this.selectedScreens['Ability 2'] === option) {
      this.selectedScreens['Ability 2'] = this.selectedScreens['Ability 1'];
    } else if (screenName === 'Ability 2' && this.selectedScreens['Ability 1'] === option) {
      this.selectedScreens['Ability 1'] = this.selectedScreens['Ability 2'];
    }

    this.selectedScreens[screenName] = option;
    this.saveLoadout();
  }

  isAbilityAvailable(ability: string, currentSlot: string): boolean {
    if (this.selectedScreens[currentSlot] === ability) {
      return true;
    }

    const otherSlot = currentSlot === 'Ability 1' ? 'Ability 2' : 'Ability 1';
    return this.selectedScreens[otherSlot] !== ability;
  }

  getCharacterImageName(id: string): string {
    const characterImages: { [key: string]: string } = {
      'pucpuc1': 'hitagi',
      'pucpuc2': 'koyomi',
      'pucpuc3': 'nadeko',
      'pucpuc4': 'shinobu',
      'pucpuc5': 'tsubasa'
    };
    return characterImages[id] || '';
  }

  getCharacterName(id: string): string {
    const characterNames: { [key: string]: string } = {
      'pucpuc1': 'Hitagi Senjogahara',
      'pucpuc2': 'Koyomi Araragi',
      'pucpuc3': 'Nadeko Sengoku',
      'pucpuc4': 'Shinobu Oshino',
      'pucpuc5': 'Tsubasa Hanekawa',
      'ability1': 'Koyomi Dazed',
      'ability2': 'Hitagi Car ride',
      'ability3': 'Mayoi Butterfly',
      'ability4': 'Suruga Cooking'
    };
    return characterNames[id] || 'Unknown';
  }

  isLoadoutComplete(): boolean {
    return Boolean(
      this.selectedScreens['Leader Puc'] &&
      this.selectedScreens['Ability 1'] &&
      this.selectedScreens['Ability 2']
    );
  }

  getStartButtonTooltip(): string {
    if (this.isLoadoutComplete()) {
      return 'Start the game!';
    }
    return `Please select your ${this.missingLoadoutParts().join(', ')}`;
  }

  private missingLoadoutParts(): string[] {
    const missing: string[] = [];
    if (!this.selectedScreens['Leader Puc']) missing.push('Leader PucPuc');
    if (!this.selectedScreens['Ability 1']) missing.push('Ability 1');
    if (!this.selectedScreens['Ability 2']) missing.push('Ability 2');
    return missing;
  }

  handleStartButtonClick(): void {
    if (!this.isLoadoutComplete()) {
      alert(`Please equip your loadout first!\nMissing: ${this.missingLoadoutParts().join(', ')}`);
    }
  }

  private loadSavedLoadout(): void {
    const savedLoadout = localStorage.getItem('pucsLoadout');
    if (!savedLoadout) return;

    try {
      const loadout = JSON.parse(savedLoadout);
      if (loadout.leaderPuc) this.selectedScreens['Leader Puc'] = loadout.leaderPuc;
      if (loadout.ability1) this.selectedScreens['Ability 1'] = loadout.ability1;
      if (loadout.ability2) this.selectedScreens['Ability 2'] = loadout.ability2;
    } catch (e) {
      console.error('Error loading saved loadout:', e);
    }
  }

  private saveLoadout(): void {
    localStorage.setItem('pucsLoadout', JSON.stringify({
      leaderPuc: this.selectedScreens['Leader Puc'],
      ability1: this.selectedScreens['Ability 1'],
      ability2: this.selectedScreens['Ability 2']
    }));
  }

  async openLeaderboards(): Promise<void> {
    this.showLeaderboardsScreen = true;
    this.loadLocalHighScores();

    if (!this.fireService.currentUid) {
      this.leaderboard = [];
      this.leaderboardError = 'Sign in to see the global leaderboard.';
      return;
    }

    this.leaderboardLoading = true;
    this.leaderboardError = '';
    try {
      this.leaderboard = await this.fireService.getPucLeaderboard(10);
      this.personalBest = await this.fireService.getPucPersonalBest();
    } catch (error) {
      console.error('Could not load leaderboard:', error);
      this.leaderboardError = 'Could not load the leaderboard right now.';
      this.leaderboard = [];
    } finally {
      this.leaderboardLoading = false;
    }
  }

  closeLeaderboards(): void {
    this.showLeaderboardsScreen = false;
  }

  isCurrentUser(entry: PucScoreEntry): boolean {
    return entry.uid === this.fireService.currentUid;
  }

  openMap(): void {
    this.showMapScreen = true;
  }

  closeMap(): void {
    this.showMapScreen = false;
  }
}
