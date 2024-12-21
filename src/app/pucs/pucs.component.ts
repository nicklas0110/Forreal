import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';

interface Puc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  type: number;
  selected: boolean;
  removing?: boolean;
  scale?: number;
  image?: HTMLImageElement;
  tier: number;
}

@Component({
  selector: 'app-pucs',
  templateUrl: './pucs.component.html',
  styleUrls: ['./pucs.component.scss']
})
export class PucsComponent implements OnInit, AfterViewInit {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private canvas!: HTMLCanvasElement;
  
  private readonly GAME_DURATION = 120; // 10 seconds for testing
  private readonly HEADER_OFFSET = 60;
  private readonly CANVAS_WIDTH = 600;
  private readonly CANVAS_HEIGHT = 850;
  private readonly PLAY_RADIUS = 280;
  private readonly PUC_RADIUS = 28;
  private readonly PUC_DISPLAY_SCALE = 1.3;
  
  private pucs: Puc[] = [];
  private selectedPucs: Puc[] = [];
  private animationId: number = 0;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private isMouseDown: boolean = false;
  
  // Game state
  private score: number = 0;
  private timeLeft: number = 120;
  private feverMode: boolean = false;
  private feverGauge: number = 0;
  private readonly FEVER_THRESHOLD = 500;
  
  private readonly COLORS = [
    '#FF6B6B',  // Hitagi
    '#4169E1',  // Nadeko
    '#9370DB',  // Koyomi
    '#FFA500',  // Tsubasa
    '#8B4513'   // Shinobu
  ];

  private readonly ORBIT_RADIUS = 140; // Distance from center where pucs should orbit
  private readonly ORBIT_FORCE = 0.1;  // Force to maintain orbital distance
  private readonly SPACING_FORCE = 0.05; // Force to maintain spacing between pucs
  private readonly ATTRACTION_FORCE = 0.1; // Slightly reduced for smoother movement
  
  private readonly DAMPING = 0.95;
  private readonly CENTER_RADIUS = 25;
  private readonly MAX_SPEED = 2.5;
  private readonly CONNECTION_RANGE = 2.5; // Increased from 3.2
  private readonly SPAWN_DELAY = 300; // ms between spawns
  private spawnQueue: number = 0;

  private readonly INITIAL_PUCS = 50;
  private readonly MIN_SPAWN_COUNT = 3; // Minimum Pucs to spawn after a match

  private pucImages: HTMLImageElement[] = [];
  
  // Adjust vertical position for larger play area
  private readonly PLAY_AREA_Y = this.CANVAS_HEIGHT / 2.5;

  private readonly MAX_VISIBLE_TIER = 10;  // Pucs disappear at this tier
  private readonly MAX_TIER = 20;          // Maximum possible tier
  private readonly TIER_SCALE_FACTOR = 1.10; // Reduced from 1.15

  private readonly SINGLE_TAP_POINT_MULTIPLIER = 0.8;

  private readonly FEVER_DURATION = 10000; // 10 seconds in milliseconds
  private feverStartTime: number = 0;
  private feverTimeLeft: number = 0;
  private feverEndTime: number = 0;
  private readonly FEVER_DRAIN_SPEED = this.FEVER_THRESHOLD / (this.FEVER_DURATION / 16.67); // For 60fps drain

  private readonly CENTER_Y_VISUAL_OFFSET = 0; // Adjust this value to move the visual circle down

  private centerImage: HTMLImageElement | null = null;
  private centerFeverImage: HTMLImageElement | null = null;  // Add new image property

  private readonly CENTER_IMAGE_SIZE = 70; // Size for the visual image, keeping it a bit larger than hitbox

  private lastUpdateTime: number = 0;  // Add this if it's missing

  private readonly MAX_CHAIN_MULTIPLIER = 2.0;  // Maximum chain multiplier

  constructor() {
    // Load puc images with correct filenames
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
  }

  ngOnInit(): void {
    // Load regular center image
    this.centerImage = new Image();
    this.centerImage.src = 'assets/pucpuc/koyomi01.png';

    // Load fever center image
    this.centerFeverImage = new Image();
    this.centerFeverImage.src = 'assets/pucpuc/koyomiFever.png';

    this.lastUpdateTime = Date.now();
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    // Add margin to the canvas element
    canvas.style.marginTop = `${this.HEADER_OFFSET}px`;

    canvas.width = this.CANVAS_WIDTH;
    canvas.height = this.CANVAS_HEIGHT;

    // Just handle mouse events
    canvas.addEventListener('mousedown', (e: MouseEvent) => this.handleMouseDown(e));
    canvas.addEventListener('mousemove', (e: MouseEvent) => this.handleMouseMove(e));
    canvas.addEventListener('mouseup', (e: MouseEvent) => this.handleMouseUp(e));
    canvas.addEventListener('mouseleave', (e: MouseEvent) => this.handleMouseUp(e));

    this.initializeGame();
    this.startGameLoop();
  }

  private initializeGame(): void {
    this.pucs = [];
    this.selectedPucs = [];
    this.score = 0;
    this.timeLeft = this.GAME_DURATION;  // Make sure we're using GAME_DURATION
    this.feverMode = false;
    this.feverGauge = 0;
    this.feverTimeLeft = 0;
    this.feverStartTime = 0;
    this.lastUpdateTime = Date.now();

    // Rest of initialization...
    for (let i = 0; i < this.INITIAL_PUCS; i++) {
      const x = this.CANVAS_WIDTH / 2 + (Math.random() - 0.5) * this.PLAY_RADIUS;
      const type = Math.floor(Math.random() * this.COLORS.length);

      // Add random tier with weighted probabilities
      let randomTier = 1;
      const tierChance = Math.random();
      if (tierChance < 0.4) randomTier = 1;
      else if (tierChance < 0.7) randomTier = 2;
      else if (tierChance < 0.85) randomTier = 3;
      else if (tierChance < 0.95) randomTier = 4;
      else randomTier = 5;

      this.pucs.push({
        x,
        y: 80,
        vx: 0,
        vy: 0,
        type: type,
        color: this.COLORS[type],
        selected: false,
        image: this.pucImages[type],
        tier: randomTier
      });
    }

    this.feverMode = false;
    this.feverGauge = 0;
    this.feverTimeLeft = 0;
    this.feverStartTime = 0;
    this.lastUpdateTime = Date.now();
    console.log('Game initialized, fever states reset');
  }

  private getMousePosition(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private findPucAtPosition(x: number, y: number): Puc | null {
    for (const puc of this.pucs) {
      const dx = puc.x - x;
      const dy = puc.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const pucScale = Math.pow(this.TIER_SCALE_FACTOR, puc.tier - 1);
      
      if (distance <= this.PUC_RADIUS * pucScale) {
        return puc;
      }
    }
    return null;
  }

  private handleMouseDown(event: MouseEvent): void {
    this.isMouseDown = true;
    const { x, y } = this.getMousePosition(event);
    
    const clickedPuc = this.findPucAtPosition(x, y);
    if (clickedPuc) {
      this.startChain(clickedPuc);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!this.isMouseDown) return;
    this.isMouseDown = false;
    this.mousePosition = null; // Clear mouse position
    
    if (this.selectedPucs.length > 0) {
      this.removeSelectedPucs();
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    this.mousePosition = this.getMousePosition(event);

    if (!this.isMouseDown || this.selectedPucs.length === 0) return;
    
    const hoveredPuc = this.findPucAtPosition(this.mousePosition.x, this.mousePosition.y);
    
    if (hoveredPuc && !hoveredPuc.selected) {
      const lastPuc = this.selectedPucs[this.selectedPucs.length - 1];
      if (hoveredPuc.type === lastPuc.type && this.areAdjacent(lastPuc, hoveredPuc)) {
        this.addToChain(hoveredPuc);
      }
    }
  }

  private startChain(puc: Puc): void {
    this.clearSelection();
    puc.selected = true;
    this.selectedPucs.push(puc);
  }

  private addToChain(puc: Puc): void {
    if (puc.selected) return;
    
    const lastPuc = this.selectedPucs[this.selectedPucs.length - 1];
    
    // Only check adjacency if we're adding to a chain (more than 1 puc)
    if (this.selectedPucs.length === 1 || 
        (this.areAdjacent(lastPuc, puc) && puc.type === lastPuc.type)) {
      if (!this.selectedPucs.includes(puc)) {
        puc.selected = true;
        this.selectedPucs.push(puc);
      }
    }
  }

  private areAdjacent(puc1: Puc, puc2: Puc): boolean {
    const dx = puc1.x - puc2.x;
    const dy = puc1.y - puc2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Scale connection range based on puc sizes
    const puc1Scale = Math.pow(this.TIER_SCALE_FACTOR, puc1.tier - 1);
    const puc2Scale = Math.pow(this.TIER_SCALE_FACTOR, puc2.tier - 1);
    const averageScale = (puc1Scale + puc2Scale) / 2;
    
    return distance <= this.PUC_RADIUS * this.CONNECTION_RANGE * averageScale;
  }

  private removeSelectedPucs(): void {
    const count = this.selectedPucs.length;
    if (count < 1) return;
    
    // Calculate points based on tiers and chain length
    let totalPoints = 0;
    for (const puc of this.selectedPucs) {
      // More gradual scaling with tier
      const tierMultiplier = 1 + ((puc.tier - 1) * 0.1);  // Each tier adds 10%
      const basePoints = 10 * tierMultiplier;
      totalPoints += basePoints;
    }

    // Apply chain bonus for multiple pucs (0.25 per puc, max 2x)
    if (count > 1) {
      const chainMultiplier = Math.min(this.MAX_CHAIN_MULTIPLIER, 1 + ((count - 1) * 0.25));
      totalPoints *= chainMultiplier;
    } else {
      totalPoints *= this.SINGLE_TAP_POINT_MULTIPLIER;  // Single tap bonus
    }

    // Apply fever multiplier if active
    if (this.feverMode) {
      totalPoints *= 2;
    }

    // Add to score
    this.score += Math.floor(totalPoints);
    
    // Add to fever gauge (balanced gain)
    if (!this.feverMode) {
      let feverGain = 0;
      if (count === 1) {
        feverGain = 0.5; // Small gain for single taps
      } else {
        // Bonus for longer chains and higher tiers
        feverGain = count + Math.floor(totalPoints / 2);
      }
      
      this.feverGauge = Math.min(this.FEVER_THRESHOLD, this.feverGauge + feverGain);
      
      if (this.feverGauge >= this.FEVER_THRESHOLD) {
        this.activateFeverMode();
      }
    }

    // Remove pucs
    this.selectedPucs.forEach(puc => {
      puc.removing = true;
      puc.scale = 1;
    });
    
    // For single taps, just remove and spawn replacement
    if (count === 1) {
      this.spawnQueue = 1;
    } else {
      // Original combining logic for 2+ pucs
      if (totalPoints >= this.MAX_VISIBLE_TIER) {
        this.spawnQueue = count;
      } else {
        // Create new combined puc
        const centerX = this.selectedPucs.reduce((sum, puc) => sum + puc.x, 0) / count;
        const centerY = this.selectedPucs.reduce((sum, puc) => sum + puc.y, 0) / count;
        
        this.pucs.push({
          x: centerX,
          y: centerY,
          vx: 0,
          vy: 0,
          type: this.selectedPucs[0].type,
          color: this.selectedPucs[0].color,
          selected: false,
          image: this.selectedPucs[0].image,
          tier: Math.min(totalPoints, this.MAX_TIER)
        });
        
        this.spawnQueue = count - 1;
      }
    }
    
    // Remove old pucs after animation
    setTimeout(() => {
      this.pucs = this.pucs.filter(p => !p.removing);
      this.selectedPucs = [];
    }, 300);
  }

  private activateFeverMode(): void {
    if (!this.feverMode) {  // Only activate if not already in fever mode
      console.log('STARTING fever mode');
      this.feverMode = true;
      this.feverStartTime = Date.now();
      this.feverTimeLeft = this.FEVER_DURATION;
      this.feverGauge = this.FEVER_THRESHOLD;
      console.log(`Fever started at: ${this.feverStartTime}`);
    }
  }

  private updateFeverMode(): void {
    if (this.feverMode) {
      const currentTime = Date.now();
      this.feverTimeLeft = Math.max(0, this.feverEndTime - currentTime);
      
      // Smoothly drain the fever gauge
      this.feverGauge = (this.feverTimeLeft / this.FEVER_DURATION) * this.FEVER_THRESHOLD;
      
      if (this.feverTimeLeft <= 0) {
        this.feverMode = false;
        this.feverGauge = 0; // Ensure it's completely empty when fever ends
      }
    }
  }

  private rearrangePucs(): void {
    // Simple gravity: move pucs down if there's space below
    let moved;
    do {
      moved = false;
      for (let i = this.pucs.length - 1; i >= 0; i--) {
        const puc = this.pucs[i];
        const spaceBelow = this.findSpaceBelow(puc);
        if (spaceBelow) {
          puc.y += this.PUC_RADIUS * 2;
          moved = true;
        }
      }
    } while (moved);
  }

  private findSpaceBelow(puc: Puc): boolean {
    const below = puc.y + this.PUC_RADIUS * 2;
    if (below >= this.CANVAS_HEIGHT) return false;
    
    return !this.pucs.some(other => 
      other !== puc &&
      Math.abs(other.x - puc.x) < this.PUC_RADIUS &&
      Math.abs(other.y - below) < this.PUC_RADIUS
    );
  }

  private startTimer(): void {
    const timer = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        clearInterval(timer);
        this.gameOver();
      }
    }, 1000);
  }

  private gameOver(): void {
    // Stop the game loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    // Show game over message with final score
    alert(`Game Over! Final Score: ${this.score}`);

    // Optional: Reset game state if you want to allow restart
    this.initializeGame();
    this.startGameLoop();
  }

  private isWithinPlayArea(x: number, y: number, centerX: number, centerY: number): boolean {
    const distance = Math.sqrt(
      Math.pow(x - centerX, 2) + 
      Math.pow(y - centerY, 2)
    );
    return distance <= this.PLAY_RADIUS - this.PUC_RADIUS;
  }

  private updatePhysics(): void {
    const centerX = this.CANVAS_WIDTH / 2;
    const centerY = this.PLAY_AREA_Y;

    if (this.spawnQueue > 0) {
      this.spawnNewPuc();
      this.spawnQueue--;
    }

    for (const puc of this.pucs) {
      if (puc.removing) continue;

      // Calculate distance to center for attraction
      const dx = centerX - puc.x;
      const dy = centerY - puc.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Black hole attraction effect
      const attractionMultiplier = 1 / (distance * 0.1);
      puc.vx += dx * this.ATTRACTION_FORCE * attractionMultiplier;
      puc.vy += dy * this.ATTRACTION_FORCE * attractionMultiplier;

      // Apply damping
      puc.vx *= this.DAMPING;
      puc.vy *= this.DAMPING;

      // Limit speed
      const speed = Math.sqrt(puc.vx * puc.vx + puc.vy * puc.vy);
      if (speed > this.MAX_SPEED) {
        puc.vx = (puc.vx / speed) * this.MAX_SPEED;
        puc.vy = (puc.vy / speed) * this.MAX_SPEED;
      }
    }

    // Handle collisions
    for (let i = 0; i < this.pucs.length; i++) {
      const puc1 = this.pucs[i];
      if (puc1.removing) continue;

      // Collisions with other pucs
      for (let j = i + 1; j < this.pucs.length; j++) {
        const puc2 = this.pucs[j];
        if (puc2.removing) continue;

        const collisionDx = puc2.x - puc1.x;
        const collisionDy = puc2.y - puc1.y;
        const collisionDist = Math.sqrt(collisionDx * collisionDx + collisionDy * collisionDy);
        
        // Scale minimum distance based on both pucs' tiers
        const puc1Scale = Math.pow(this.TIER_SCALE_FACTOR, puc1.tier - 1);
        const puc2Scale = Math.pow(this.TIER_SCALE_FACTOR, puc2.tier - 1);
        const minDist = this.PUC_RADIUS * 2 * ((puc1Scale + puc2Scale) / 2);

        if (collisionDist < minDist) {
          // Collision response
          const angle = Math.atan2(collisionDy, collisionDx);
          const overlap = minDist - collisionDist;

          // Move pucs apart proportionally to their sizes
          const totalScale = puc1Scale + puc2Scale;
          const puc1Move = (puc2Scale / totalScale) * overlap;
          const puc2Move = (puc1Scale / totalScale) * overlap;

          const moveX = Math.cos(angle);
          const moveY = Math.sin(angle);

          puc1.x -= moveX * puc1Move;
          puc1.y -= moveY * puc1Move;
          puc2.x += moveX * puc2Move;
          puc2.y += moveY * puc2Move;

          // Calculate collision response
          const normalX = collisionDx / collisionDist;
          const normalY = collisionDy / collisionDist;

          // Relative velocity
          const relativeVX = puc2.vx - puc1.vx;
          const relativeVY = puc2.vy - puc1.vy;

          // Calculate impulse
          const relativeSpeed = relativeVX * normalX + relativeVY * normalY;
          const impulse = relativeSpeed * 0.5;

          // Apply impulse with size consideration
          const puc1Impulse = impulse * (puc2Scale / totalScale);
          const puc2Impulse = impulse * (puc1Scale / totalScale);

          puc1.vx += normalX * puc1Impulse;
          puc1.vy += normalY * puc1Impulse;
          puc2.vx -= normalX * puc2Impulse;
          puc2.vy -= normalY * puc2Impulse;
        }
      }

      // Update position and handle boundaries
      let newX = puc1.x + puc1.vx;
      let newY = puc1.y + puc1.vy;

      // Check center collision
      const centerDist = Math.sqrt(
        Math.pow(newX - centerX, 2) + 
        Math.pow(newY - centerY, 2)
      );

      const currentScale = Math.pow(this.TIER_SCALE_FACTOR, puc1.tier - 1);
      
      // Center boundary check
      if (centerDist < this.CENTER_RADIUS + (this.PUC_RADIUS * currentScale)) {
        const bounceAngle = Math.atan2(newY - centerY, newX - centerX);
        newX = centerX + (this.CENTER_RADIUS + (this.PUC_RADIUS * currentScale)) * Math.cos(bounceAngle);
        newY = centerY + (this.CENTER_RADIUS + (this.PUC_RADIUS * currentScale)) * Math.sin(bounceAngle);
        
        puc1.vx *= -0.5;
        puc1.vy *= -0.5;
      }

      // Outer boundary check
      const boundaryLimit = this.PLAY_RADIUS - (this.PUC_RADIUS * currentScale);
      if (centerDist > boundaryLimit) {
        const bounceAngle = Math.atan2(newY - centerY, newX - centerX);
        newX = centerX + boundaryLimit * Math.cos(bounceAngle);
        newY = centerY + boundaryLimit * Math.sin(bounceAngle);
        
        puc1.vx *= -0.5;
        puc1.vy *= -0.5;
      }

      puc1.x = newX;
      puc1.y = newY;
    }
  }

  private spawnNewPuc(): void {
    const angle = Math.random() * Math.PI * 2;
    const spawnRadius = this.PLAY_RADIUS * 0.8;
    
    // Random position around the circle
    const x = this.CANVAS_WIDTH / 2 + Math.cos(angle) * spawnRadius;
    const y = this.PLAY_AREA_Y + Math.sin(angle) * spawnRadius;
    
    // Random tier between 1 and 5, with higher tiers being less common
    let randomTier = 1;
    const tierChance = Math.random();
    if (tierChance < 0.4) randomTier = 1;
    else if (tierChance < 0.7) randomTier = 2;
    else if (tierChance < 0.85) randomTier = 3;
    else if (tierChance < 0.95) randomTier = 4;
    else randomTier = 5;
    
    // Random type (using numbers 0-4)
    const type = Math.floor(Math.random() * 5);
    
    const newPuc = {
      x,
      y,
      vx: 0,
      vy: 0,
      type,
      color: this.COLORS[type],
      selected: false,
      image: this.pucImages[type],
      tier: randomTier,
      removing: false,
      scale: 1
    };

    this.pucs.push(newPuc);
  }

  private draw(): void {
    // Clear canvas with gradient background
    const bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#FFF5F5');
    bgGradient.addColorStop(1, '#FFF0F0');
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
    
    // Draw play area circle
    this.ctx.beginPath();
    this.ctx.arc(
      this.CANVAS_WIDTH / 2,
      this.PLAY_AREA_Y,
      this.PLAY_RADIUS,
      0,
      Math.PI * 2
    );
    this.ctx.strokeStyle = '#FFCDD2';
    this.ctx.lineWidth = 5;
    this.ctx.stroke();

    // Draw center image with opacity based on fever state
    if (this.centerImage && this.centerFeverImage) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.5;
      
      // Choose image based on fever state
      const currentImage = this.feverMode ? this.centerFeverImage : this.centerImage;
      
      this.ctx.drawImage(
        currentImage,
        this.CANVAS_WIDTH / 2 - this.CENTER_IMAGE_SIZE / 2,
        this.PLAY_AREA_Y + this.CENTER_Y_VISUAL_OFFSET - this.CENTER_IMAGE_SIZE / 2,
        this.CENTER_IMAGE_SIZE,
        this.CENTER_IMAGE_SIZE
      );
      
      this.ctx.restore();
    }

    // Draw connections
    this.drawConnections();

    // Draw pucs
    for (const puc of this.pucs) {
      this.drawPuc(puc);
    }

    // Draw UI
    this.drawUI();
  }

  private drawUI(): void {
    // Draw score - moved up by adjusting Y position
    this.ctx.font = 'bold 24px Arial';
    this.ctx.fillStyle = '#333333';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Score: ${this.score}`, 20, 30);  // Changed from 40 + HEADER_OFFSET

    // Draw timer - moved up by adjusting Y position
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = Math.floor(this.timeLeft % 60);
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    this.ctx.font = 'bold 36px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(timeString, this.CANVAS_WIDTH / 2, 30);  // Changed from 40 + HEADER_OFFSET

    // Rest of the UI remains the same
    const gaugeWidth = 200;
    const gaugeHeight = 15;
    const gaugeX = (this.CANVAS_WIDTH - gaugeWidth) / 2;
    const gaugeY = this.PLAY_AREA_Y + this.PLAY_RADIUS + 30;
    
    // Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    // Filled portion
    if (this.feverGauge > 0) {
      const fillWidth = (this.feverGauge / this.FEVER_THRESHOLD) * gaugeWidth;
      this.ctx.fillStyle = this.feverMode ? '#FF6B6B' : '#FFD700';
      this.ctx.fillRect(gaugeX, gaugeY, fillWidth, gaugeHeight);
    }

    // Fever mode indicator
    if (this.feverMode) {
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.textAlign = 'center';
      const secondsLeft = Math.ceil(this.feverTimeLeft / 1000);
      this.ctx.fillText(`FEVER! x2 (${secondsLeft}s)`, this.CANVAS_WIDTH / 2, gaugeY - 10);
    }
  }

  private drawConnections(): void {
    if (this.selectedPucs.length < 1) return;

    // Draw lines between selected pucs
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 3;

    // Start from the first puc
    const firstPuc = this.selectedPucs[0];
    this.ctx.moveTo(firstPuc.x, firstPuc.y);

    // Draw lines between selected pucs
    for (let i = 1; i < this.selectedPucs.length; i++) {
      const puc = this.selectedPucs[i];
      this.ctx.lineTo(puc.x, puc.y);
    }

    // Only draw to mouse position if actively dragging
    if (this.isMouseDown && this.mousePosition) {
      const lastPuc = this.selectedPucs[this.selectedPucs.length - 1];
      const hoveredPuc = this.findPucAtPosition(this.mousePosition.x, this.mousePosition.y);
      
      // Only draw the line if hovering over a valid and adjacent puc
      if (hoveredPuc && 
          !hoveredPuc.selected && 
          hoveredPuc.type === lastPuc.type && 
          this.areAdjacent(lastPuc, hoveredPuc)) {
        this.ctx.lineTo(hoveredPuc.x, hoveredPuc.y);
      }
    }

    this.ctx.stroke();
  }

  // Add mousePosition property to track current mouse position
  private mousePosition: { x: number; y: number } | null = null;

  private drawPuc(puc: Puc): void {
    const scale = puc.removing ? (puc.scale || 1) * 0.9 : 1;
    if (puc.removing && (puc.scale || 1) < 0.1) return;
    if (puc.removing) puc.scale = scale;

    // Draw connection radius indicator when selected
    if (puc.selected && this.isMouseDown) {
      this.ctx.beginPath();
      this.ctx.arc(
        puc.x,
        puc.y,
        this.PUC_RADIUS * this.CONNECTION_RANGE * Math.pow(this.TIER_SCALE_FACTOR, puc.tier - 1),
        0,
        Math.PI * 2
      );
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.stroke();
    }

    // Draw the image with size based on tier
    if (puc.image) {
      const tierScale = Math.pow(this.TIER_SCALE_FACTOR, puc.tier - 1);
      const size = this.PUC_RADIUS * 2 * scale * this.PUC_DISPLAY_SCALE * tierScale;
      
      this.ctx.save();
      this.ctx.translate(puc.x, puc.y);
      
      // Removed bounce effect
      
      // Draw selection highlight if selected
      if (puc.selected) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.PUC_RADIUS * 1.2 * tierScale, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
      
      // Draw tier number
      if (puc.tier > 1) {
        this.ctx.font = `bold ${14 + puc.tier}px Arial`;
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(puc.tier.toString(), 0, size/4);
        this.ctx.fillText(puc.tier.toString(), 0, size/4);
      }
      
      // Draw the image
      this.ctx.drawImage(
        puc.image,
        -size/2,
        -size/2,
        size,
        size
      );
      
      this.ctx.restore();
    }
  }

  private clearSelection(): void {
    this.selectedPucs.forEach(puc => puc.selected = false);
    this.selectedPucs = [];
  }

  private startGameLoop(): void {
    const animate = () => {
      this.updateGame();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private updateGame(): void {
    const currentTime = Date.now();

    // Update timer
    if (this.timeLeft > 0) {
      const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
      this.timeLeft = Math.max(0, this.timeLeft - deltaTime);
      
      // Check for game over
      if (this.timeLeft <= 0) {
        this.gameOver();
        return;  // Stop updating once game is over
      }
    }
    this.lastUpdateTime = currentTime;

    // Fever mode update with strict timing
    if (this.feverMode) {
      const elapsedTime = currentTime - this.feverStartTime;
      
      if (elapsedTime >= this.FEVER_DURATION) {
        this.feverMode = false;
        this.feverGauge = 0;
        this.feverTimeLeft = 0;
        this.feverStartTime = 0;
      } else {
        this.feverTimeLeft = this.FEVER_DURATION - elapsedTime;
        this.feverGauge = (this.feverTimeLeft / this.FEVER_DURATION) * this.FEVER_THRESHOLD;
      }
    }

    this.updatePhysics();
    this.draw();
  }
}