import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { PucsComponent } from './pucs.component';
import { FireService, PucLevelProgress } from '../fire.service';

/** Static layout: positions are normalised so they follow the canvas size. */
interface LevelDef {
  id: number;
  nx: number;
  ny: number;
  targetScore: number;
  next: number[];
}

/** Runtime level: layout plus the player's progress. */
interface Level extends LevelDef {
  x: number;
  y: number;
  stars: number;
  unlocked: boolean;
}

const LEVEL_DEFS: LevelDef[] = [
  { id: 1, nx: 0.50, ny: 0.14, targetScore: 10000, next: [2, 3] },
  { id: 2, nx: 0.26, ny: 0.42, targetScore: 15000, next: [4] },
  { id: 3, nx: 0.74, ny: 0.42, targetScore: 20000, next: [5] },
  { id: 4, nx: 0.34, ny: 0.74, targetScore: 25000, next: [] },
  { id: 5, nx: 0.66, ny: 0.74, targetScore: 30000, next: [] }
];

@Component({
  selector: 'app-pucs-map',
  templateUrl: './pucs.map.component.html',
  styleUrls: ['./pucs.map.component.scss'],
  standalone: true
})
export class PucsMapComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animationFrameId: number = 0;

  private levels: Level[] = [];
  private selectedLevelId: number = 1;
  private leaderImage: HTMLImageElement | null = null;

  /** Logical drawing size, independent of the device pixel ratio. */
  private width: number = 0;
  private height: number = 0;

  private readonly LEVEL_RADIUS = 30;
  private readonly PLAYER_RADIUS = 20;
  private readonly PATH_WIDTH = 8;

  private resizeHandler = () => this.resizeCanvas();
  private clickHandler = (event: MouseEvent) => this.handleMapClick(event);
  private touchHandler = (event: TouchEvent) => {
    event.preventDefault();
    if (event.touches[0]) this.handleMapClick(event.touches[0]);
  };

  constructor(
    private pucsComponent: PucsComponent,
    private fireService: FireService,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    // Progress starts from the defaults and is merged over, so a stale save can
    // never move a level or wipe the layout.
    this.levels = LEVEL_DEFS.map(def => ({
      ...def,
      x: 0,
      y: 0,
      stars: 0,
      unlocked: def.id === 1
    }));

    const leaderId = this.pucsComponent.selectedScreens['Leader Puc'];
    if (leaderId) {
      this.leaderImage = new Image();
      this.leaderImage.src = `assets/pucpuc/${this.pucsComponent.getCharacterImageName(leaderId)}01.png`;
    }
  }

  ngAfterViewInit(): void {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;

    window.addEventListener('resize', this.resizeHandler);
    // Bound here only — the template used to bind (click) as well, so every
    // level tap fired startLevel() twice and double-registered the game's
    // input handlers (which is what broke pause in story mode).
    this.canvas.addEventListener('click', this.clickHandler);
    this.canvas.addEventListener('touchstart', this.touchHandler, { passive: false });

    this.resizeCanvas();
    this.loadMapProgress();

    this.zone.runOutsideAngular(() => {
      const animate = () => {
        this.drawMap();
        this.animationFrameId = requestAnimationFrame(animate);
      };
      this.animationFrameId = requestAnimationFrame(animate);
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    window.removeEventListener('resize', this.resizeHandler);
    this.canvas?.removeEventListener('click', this.clickHandler);
    this.canvas?.removeEventListener('touchstart', this.touchHandler);
  }

  /** Recomputes positions only — never touches stars or unlocks. */
  private resizeCanvas(): void {
    const container = this.canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.canvas.width = Math.max(1, Math.round(this.width * dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.layoutLevels();
  }

  private layoutLevels(): void {
    // Insets keep the level circles, their star rows and the info box on-canvas.
    const marginX = 80;
    const marginTop = 150;
    const marginBottom = 80;
    const usableWidth = Math.max(1, this.width - marginX * 2);
    const usableHeight = Math.max(1, this.height - marginTop - marginBottom);

    for (const level of this.levels) {
      level.x = marginX + level.nx * usableWidth;
      level.y = marginTop + level.ny * usableHeight;
    }
  }

  private applyProgress(progress: PucLevelProgress[]): void {
    for (const entry of progress) {
      const level = this.levels.find(l => l.id === entry.id);
      if (!level) continue;
      level.stars = entry.stars ?? 0;
      level.unlocked = level.id === 1 ? true : !!entry.unlocked;
    }
  }

  private async loadMapProgress(): Promise<void> {
    const saved = localStorage.getItem('pucsMapProgress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.levels)) {
          this.applyProgress(parsed.levels);
        }
      } catch {
        // Ignore a corrupt cache and fall back to the defaults.
      }
    }

    try {
      const remote = await this.fireService.loadPucStoryProgress();
      if (remote) this.applyProgress(remote);
    } catch (error) {
      console.error('Could not load story progress:', error);
    }
  }

  private saveMapProgress(): void {
    const progress: PucLevelProgress[] = this.levels.map(level => ({
      id: level.id,
      stars: level.stars,
      unlocked: level.unlocked
    }));

    localStorage.setItem('pucsMapProgress', JSON.stringify({ levels: progress }));
    this.fireService.savePucStoryProgress(progress)
      .catch(error => console.error('Could not save story progress:', error));
  }

  private drawMap(): void {
    if (!this.ctx || this.width === 0) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Paths follow the branch graph instead of array order, which used to
    // produce crossed zigzags between levels 2-3 and 3-4.
    this.ctx.save();
    this.ctx.lineWidth = this.PATH_WIDTH;
    this.ctx.lineCap = 'round';
    for (const level of this.levels) {
      for (const nextId of level.next) {
        const target = this.levels.find(l => l.id === nextId);
        if (!target) continue;

        this.ctx.strokeStyle = target.unlocked ? '#4CAF50' : 'rgba(255, 255, 255, 0.18)';
        this.ctx.beginPath();
        this.ctx.moveTo(level.x, level.y);
        this.ctx.lineTo(target.x, target.y);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();

    for (const level of this.levels) {
      this.drawLevel(level);
    }

    this.drawPlayer();
  }

  private drawLevel(level: Level): void {
    this.ctx.save();

    this.ctx.beginPath();
    this.ctx.arc(level.x, level.y, this.LEVEL_RADIUS, 0, Math.PI * 2);
    this.ctx.fillStyle = level.unlocked ? '#4CAF50' : '#666';
    this.ctx.fill();
    this.ctx.strokeStyle = level.id === this.selectedLevelId ? '#FF6B6B' : '#fff';
    this.ctx.lineWidth = level.id === this.selectedLevelId ? 4 : 2;
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(level.id.toString(), level.x, level.y);

    const starRadius = 8;
    const starSpacing = 20;
    for (let i = 0; i < 3; i++) {
      this.drawStar(
        level.x - starSpacing + i * starSpacing,
        level.y + this.LEVEL_RADIUS + 12,
        starRadius,
        starRadius / 2.2,
        i < level.stars
      );
    }

    this.ctx.font = '13px Arial';
    this.ctx.fillStyle = level.unlocked ? '#fff' : 'rgba(255, 255, 255, 0.5)';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(
      level.targetScore.toLocaleString(),
      level.x,
      level.y + this.LEVEL_RADIUS + 26
    );

    this.ctx.restore();

    if (level.id === this.selectedLevelId) {
      this.drawInfoBox(level);
    }
  }

  private drawInfoBox(level: Level): void {
    const boxWidth = 200;
    const boxHeight = 96;
    // Clamped into the canvas — level 1's box used to be drawn off the top edge.
    const boxX = Math.min(Math.max(8, level.x - boxWidth / 2), this.width - boxWidth - 8);
    const boxY = Math.max(8, level.y - this.LEVEL_RADIUS - boxHeight - 16);

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    this.ctx.strokeStyle = '#FF6B6B';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.font = 'bold 16px Arial';
    this.ctx.fillStyle = '#FF6B6B';
    this.ctx.fillText(`Level ${level.id}`, boxX + boxWidth / 2, boxY + 26);

    this.ctx.font = '14px Arial';
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText(
      `Score ${level.targetScore.toLocaleString()}`,
      boxX + boxWidth / 2,
      boxY + 52
    );
    this.ctx.fillText(
      level.unlocked ? 'to get 3 stars!' : 'Locked',
      boxX + boxWidth / 2,
      boxY + 74
    );
    this.ctx.restore();
  }

  private drawPlayer(): void {
    const level = this.levels.find(l => l.id === this.selectedLevelId) || this.levels[0];
    if (!level) return;

    if (this.leaderImage && this.leaderImage.complete && this.leaderImage.naturalWidth > 0) {
      this.ctx.save();
      this.ctx.drawImage(this.leaderImage, level.x - 26, level.y - 58, 52, 52);
      this.ctx.restore();
      return;
    }

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(level.x, level.y - 32, this.PLAYER_RADIUS, 0, Math.PI * 2);
    this.ctx.fillStyle = '#2196F3';
    this.ctx.fill();
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.restore();
  }

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
    this.ctx.strokeStyle = filled ? '#FFD700' : 'rgba(255, 215, 0, 0.45)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    this.ctx.restore();
  }

  handleMapClick(event: MouseEvent | Touch): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.width / rect.width);
    const y = (event.clientY - rect.top) * (this.height / rect.height);

    const clickedLevel = this.levels.find(level =>
      Math.hypot(x - level.x, y - level.y) <= this.LEVEL_RADIUS
    );

    if (!clickedLevel || !clickedLevel.unlocked) return;

    this.selectedLevelId = clickedLevel.id;
    this.zone.run(() => this.startLevel(clickedLevel));
  }

  private startLevel(level: Level): void {
    if (!this.pucsComponent.isLoadoutComplete()) {
      // startGame() would silently no-op otherwise, leaving a blank screen.
      this.pucsComponent.handleStartButtonClick();
      return;
    }

    this.pucsComponent.isMapMode = true;
    this.pucsComponent.mapTargetScore = level.targetScore;
    this.pucsComponent.mapStars = level.stars;
    this.pucsComponent.onLevelComplete = (stars: number) => this.completeLevel(level.id, stars);

    this.saveMapProgress();
    this.pucsComponent.closeMap();
    this.pucsComponent.startGame();
  }

  private completeLevel(levelId: number, stars: number): void {
    const level = this.levels.find(l => l.id === levelId);
    if (!level) return;

    level.stars = Math.max(level.stars, stars);

    // Earning at least one star opens whatever this level leads to.
    if (level.stars > 0) {
      for (const nextId of level.next) {
        const next = this.levels.find(l => l.id === nextId);
        if (next) next.unlocked = true;
      }
    }

    this.saveMapProgress();
  }
}
