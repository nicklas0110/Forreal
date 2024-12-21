import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';

interface Puc {
  id: number;
  type: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

@Component({
  selector: 'app-pucs',
  templateUrl: './pucs.component.html',
  styleUrls: ['./pucs.component.scss']
})
export class PucsComponent implements OnInit, OnDestroy {
  readonly GRID_SIZE = 12;
  readonly PUC_SIZE = 48;
  readonly VISIBLE_SIZE = 384;
  readonly RADIUS = this.PUC_SIZE / 2;
  readonly GAME_DURATION = 60;
  readonly COMBO_TIMEOUT = 3000;
  readonly GRAVITY = 0.15;
  readonly DAMPING = 0.98;
  readonly COLLISION_DAMPING = 0.5;
  readonly CENTER_ATTRACTION = 0.02;
  readonly MIN_SPEED = 0.01;

  readonly PUC_TYPES = [
    { type: '😊', color: 'bg-red-500' },
    { type: '😎', color: 'bg-blue-500' },
    { type: '😍', color: 'bg-green-500' },
    { type: '🤔', color: 'bg-yellow-500' },
    { type: '😮', color: 'bg-purple-500' }
  ];

  pucs: Puc[] = [];
  selectedPucs: Puc[] = [];
  isDragging = false;
  score = 0;
  feverGauge = 0;
  comboMultiplier = 1;
  timeLeft = this.GAME_DURATION;
  gameOver = false;
  comboTimeLeft = 0;
  private comboTimer?: any;
  private gameTimer?: any;
  private physicsInterval?: any;

  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.initializeGame();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.comboTimer) clearTimeout(this.comboTimer);
    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.physicsInterval) clearInterval(this.physicsInterval);
  }

  createPuc(x: number, y: number, withVelocity = false): Puc {
    const typeIndex = Math.floor(Math.random() * this.PUC_TYPES.length);
    return {
      id: Math.random(),
      ...this.PUC_TYPES[typeIndex],
      x,
      y,
      vx: withVelocity ? (Math.random() - 0.5) * 3 : 0,
      vy: withVelocity ? Math.random() * 2 : 0,
    };
  }

  initializeGame(): void {
    this.clearTimers();

    this.pucs = Array.from({ length: this.GRID_SIZE * this.GRID_SIZE }, (_, i) => {
      const col = i % this.GRID_SIZE;
      const row = Math.floor(i / this.GRID_SIZE);
      return this.createPuc(col * this.PUC_SIZE, row * this.PUC_SIZE);
    });

    this.score = 0;
    this.feverGauge = 0;
    this.comboMultiplier = 1;
    this.timeLeft = this.GAME_DURATION;
    this.gameOver = false;
    this.comboTimeLeft = 0;

    this.startGameTimer();
    this.startPhysicsTimer();
  }

  private startGameTimer(): void {
    this.ngZone.runOutsideAngular(() => {
      this.gameTimer = setInterval(() => {
        this.ngZone.run(() => {
          if (this.timeLeft > 0) {
            this.timeLeft--;
          } else {
            this.gameOver = true;
            this.clearTimers();
          }
        });
      }, 1000);
    });
  }

  private startPhysicsTimer(): void {
    this.ngZone.runOutsideAngular(() => {
      this.physicsInterval = setInterval(() => {
        this.ngZone.run(() => {
          this.updatePhysics();
        });
      }, 16);
    });
  }

  private handleCollisions(pucs: Puc[]): Puc[] {
    const iterations = 3;
    let updatedPucs = [...pucs];

    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let i = 0; i < updatedPucs.length; i++) {
        for (let j = i + 1; j < updatedPucs.length; j++) {
          const puc1 = updatedPucs[i];
          const puc2 = updatedPucs[j];

          const dx = puc2.x - puc1.x;
          const dy = puc2.y - puc1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < this.PUC_SIZE) {
            const angle = Math.atan2(dy, dx);
            const overlap = this.PUC_SIZE - distance;

            const moveX = (overlap * Math.cos(angle)) * 0.7;
            const moveY = (overlap * Math.sin(angle)) * 0.7;

            updatedPucs[i] = {
              ...updatedPucs[i],
              x: updatedPucs[i].x - moveX,
              y: updatedPucs[i].y - moveY
            };

            updatedPucs[j] = {
              ...updatedPucs[j],
              x: updatedPucs[j].x + moveX,
              y: updatedPucs[j].y + moveY
            };

            const normalX = dx / distance;
            const normalY = dy / distance;

            const relativeVelocityX = puc2.vx - puc1.vx;
            const relativeVelocityY = puc2.vy - puc1.vy;

            const impulse = (relativeVelocityX * normalX + relativeVelocityY * normalY) * this.COLLISION_DAMPING;

            updatedPucs[i] = {
              ...updatedPucs[i],
              vx: updatedPucs[i].vx + impulse * normalX * 1.2,
              vy: updatedPucs[i].vy + impulse * normalY * 1.2
            };

            updatedPucs[j] = {
              ...updatedPucs[j],
              vx: updatedPucs[j].vx - impulse * normalX * 1.2,
              vy: updatedPucs[j].vy - impulse * normalY * 1.2
            };
          }
        }
      }
    }
    return updatedPucs;
  }

  private updatePhysics(): void {
    let updatedPucs = this.pucs.map(puc => {
      const centerX = (this.GRID_SIZE * this.PUC_SIZE) / 2;
      const centerY = (this.GRID_SIZE * this.PUC_SIZE) / 2;
      const dx = centerX - puc.x;
      const dy = centerY - puc.y;
      const distanceToCenter = Math.sqrt(dx * dx + dy * dy);

      const CENTER_FORCE = 0.5;
      let newVx = puc.vx + (dx / distanceToCenter) * CENTER_FORCE;
      let newVy = puc.vy + (dy / distanceToCenter) * CENTER_FORCE + this.GRAVITY;

      newVx *= this.DAMPING;
      newVy *= this.DAMPING;

      if (Math.abs(newVx) < this.MIN_SPEED) newVx = 0;
      if (Math.abs(newVy) < this.MIN_SPEED) newVy = 0;

      let newX = puc.x + newVx;
      let newY = puc.y + newVy;

      const maxRadius = (this.GRID_SIZE * this.PUC_SIZE) / 2;
      const newDx = newX - centerX;
      const newDy = newY - centerY;
      const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);

      if (newDistance > maxRadius) {
        const angle = Math.atan2(newDy, newDx);
        newX = centerX + Math.cos(angle) * maxRadius;
        newY = centerY + Math.sin(angle) * maxRadius;
        
        const normalX = newDx / newDistance;
        const normalY = newDy / newDistance;
        const dot = newVx * normalX + newVy * normalY;
        newVx = (newVx - 2 * dot * normalX) * this.COLLISION_DAMPING;
        newVy = (newVy - 2 * dot * normalY) * this.COLLISION_DAMPING;
      }

      return {
        ...puc,
        x: newX,
        y: newY,
        vx: newVx,
        vy: newVy
      };
    });

    updatedPucs = this.handleCollisions(updatedPucs);
    this.pucs = updatedPucs;
  }

  isAdjacent(puc1: Puc, puc2: Puc): boolean {
    const dx = Math.abs(puc1.x - puc2.x);
    const dy = Math.abs(puc1.y - puc2.y);
    return dx <= this.PUC_SIZE * 1.5 && dy <= this.PUC_SIZE * 1.5 && puc1.type === puc2.type;
  }

  handlePucSelect(puc: Puc): void {
    if (!this.gameOver) {
      this.isDragging = true;
      this.selectedPucs = [puc];
    }
  }

  handlePucDrag(puc: Puc): void {
    if (!this.isDragging || this.gameOver) return;

    const lastPuc = this.selectedPucs[this.selectedPucs.length - 1];
    if (this.isAdjacent(puc, lastPuc) && !this.selectedPucs.includes(puc)) {
      this.selectedPucs = [...this.selectedPucs, puc];
    }
  }

  private handleMatchedPucs(matchedPucs: Puc[]): void {
    // Remove matched pucs
    this.pucs = this.pucs.filter(puc => !matchedPucs.includes(puc));
    
    // Add the same number of new pucs
    const numPucsToAdd = matchedPucs.length;
    this.addNewPucs(numPucsToAdd);
    
    // Update score
    this.score += matchedPucs.length * 10;
  }

  private addNewPucs(count: number): void {
    const centerX = (this.GRID_SIZE * this.PUC_SIZE) / 2;
    const topY = 0;
    const maxRadius = (this.GRID_SIZE * this.PUC_SIZE) / 4;

    const emojiTypes = ['🎮', '🎲', '🎯', '🎪', '🎨', '🎭'];

    for (let i = 0; i < count; i++) {
      const spreadX = centerX + (Math.random() - 0.5) * (maxRadius);
      const randomTypeIndex = Math.floor(Math.random() * emojiTypes.length);
      const newPuc = {
        id: Date.now() + i,
        x: spreadX,
        y: topY - (i * this.PUC_SIZE),
        vx: 0,
        vy: 0,
        type: emojiTypes[randomTypeIndex],
        color: this.getRandomColor()
      };
      this.pucs.push(newPuc);
    }
  }

  private getRandomColor(): string {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-orange-500'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  handlePucRelease(): void {
    if (this.selectedPucs.length >= 2) {
      if (this.comboTimer) clearTimeout(this.comboTimer);

      const selectedIds = new Set(this.selectedPucs.map(p => p.id));
      this.pucs = this.pucs.filter(puc => !selectedIds.has(puc.id));
      this.addNewPucs(this.selectedPucs.length);

      const matchScore = this.selectedPucs.length * 100 * this.comboMultiplier;
      this.score += matchScore;
      this.comboMultiplier += 0.5;

      this.comboTimer = setTimeout(() => {
        this.ngZone.run(() => {
          this.comboMultiplier = 1;
        });
      }, this.COMBO_TIMEOUT);

      this.comboTimeLeft = this.COMBO_TIMEOUT;
      this.feverGauge = Math.min(100, this.feverGauge + this.selectedPucs.length * 5);
    }

    this.isDragging = false;
    this.selectedPucs = [];
  }
}
