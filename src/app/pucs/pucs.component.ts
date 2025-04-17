import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PucsMapComponent } from './pucs.map.component';
import { NgIf, NgFor } from '@angular/common';

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
  blinking?: boolean;
  blinkStartTime?: number | undefined;
  combining?: boolean;
  combineStartTime?: number;
  targetX?: number;
  targetY?: number;
}

interface Explosion {
  x: number;
  y: number;
  startTime: number;
  color: string;
  maxRadius: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  startTime: number;
  speed: number;
}

@Component({
  selector: 'app-pucs',
  templateUrl: './pucs.component.html',
  styleUrls: ['./pucs.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, PucsMapComponent, NgIf, NgFor]
})
export class PucsComponent implements OnInit, AfterViewInit {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private canvas!: HTMLCanvasElement;
  
  private readonly GAME_DURATION = 120; // 10 seconds for testing
  private readonly HEADER_OFFSET = 100;
  private readonly CANVAS_WIDTH = 600;
  private readonly CANVAS_HEIGHT = 1050; // Increased from 950 to 1050
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
  public score: number = 0;
  private timeLeft: number = 120;
  private feverMode: boolean = false;
  private feverGauge: number = 0;
  private readonly FEVER_THRESHOLD = 500;
  private scoreAtFeverStart: number = 0;
  private comboCount: number = 0;
  private lastComboTime: number = 0;  // Add combo timer
  
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
  private readonly PLAY_AREA_Y = this.CANVAS_HEIGHT / 2;

  private readonly MAX_VISIBLE_TIER = 10;  // Pucs disappear at this tier
  private readonly MAX_TIER = 20;          // Maximum possible tier
  private readonly TIER_SCALE_FACTOR = 1.10; // Reduced from 1.15
  private readonly EXPLOSION_THRESHOLD = 10;  // Changed from 9 to 10
  private readonly MAX_VISUAL_SIZE = 2.0;    // Maximum visual size multiplier

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

  gameStarted: boolean = false;
  showLoadoutScreen: boolean = false;
  showLeaderboardsScreen: boolean = false;
  showEndScreen: boolean = false;
  showMapScreen: boolean = false;
  isHighScore: boolean = false;
  playerName: string = '';
  highScores: {name: string, score: number, date: string}[] = [];
  selectedScreens: { [key: string]: string } = {
    'Leader Puc': '',
    'Ability 1': '',
    'Ability 2': ''
  };

  // Track which abilities are available
  availableAbilities: string[] = ['ability1', 'ability2', 'ability3', 'ability4'];

  private selectedLeaderPuc: string = '';
  private selectedAbility1: string = '';
  private selectedAbility2: string = '';

  private isPaused: boolean = false;
  private lastPauseTime: number = 0;
  private pauseDuration: number = 0;

  private explosions: Explosion[] = [];
  private stars: Star[] = [];
  private readonly EXPLOSION_DURATION = 500; // Duration of explosion animation in ms
  private readonly EXPLOSION_PARTICLES = 20; // Number of particles in explosion
  private readonly STAR_COUNT = 50; // Number of stars in background
  private readonly STAR_MIN_SIZE = 2;
  private readonly STAR_MAX_SIZE = 5;
  private readonly STAR_MIN_SPEED = 0.5;
  private readonly STAR_MAX_SPEED = 2;

  // Map mode properties
  public isMapMode: boolean = false;
  public mapTargetScore: number = 10000; // Example target score
  public mapStars: number = 0; // 0-3 stars based on progress
  private readonly STAR_THRESHOLDS = [0.3, 0.6, 1.0]; // 30%, 60%, 100% for 1, 2, 3 stars

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
    this.loadSavedLoadout();
  }

  ngAfterViewInit(): void {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.width = this.CANVAS_WIDTH;
    this.canvas.height = this.CANVAS_HEIGHT;

    // Only load images, don't start the game yet
    this.loadImages();
  }

  private initializeGame(): void {
    this.pucs = [];
    this.selectedPucs = [];
    this.score = 0;
    this.timeLeft = this.GAME_DURATION;
    this.feverMode = false;
    this.feverGauge = 0;
    this.feverTimeLeft = 0;
    this.feverStartTime = 0;
    this.comboCount = 0;
    this.lastComboTime = 0;  // Reset combo timer
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

    this.explosions = [];
    this.stars = [];
    // Initialize stars
    for (let i = 0; i < this.STAR_COUNT; i++) {
      this.stars.push(this.createStar());
    }
  }

  private createStar(): Star {
    return {
      x: Math.random() * this.CANVAS_WIDTH,
      y: Math.random() * this.CANVAS_HEIGHT,
      size: this.STAR_MIN_SIZE + Math.random() * (this.STAR_MAX_SIZE - this.STAR_MIN_SIZE),
      startTime: Date.now(),
      speed: this.STAR_MIN_SPEED + Math.random() * (this.STAR_MAX_SPEED - this.STAR_MIN_SPEED)
    };
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
      // Calculate tier scale with max visual size limit
      const tierScale = Math.min(
        this.MAX_VISUAL_SIZE,
        Math.pow(this.TIER_SCALE_FACTOR, puc.tier - 1)
      );
      
      if (distance <= this.PUC_RADIUS * tierScale) {
        return puc;
      }
    }
    return null;
  }

  private handleMouseDown(event: MouseEvent): void {
    const { x, y } = this.getMousePosition(event);
    
    // Check if pause button was clicked
    const pauseButtonSize = 30;
    const pauseButtonX = this.CANVAS_WIDTH - pauseButtonSize - 20;
    const pauseButtonY = this.isMapMode ? 90 + this.HEADER_OFFSET : 20 + this.HEADER_OFFSET;
    
    if (x >= pauseButtonX && x <= pauseButtonX + pauseButtonSize &&
        y >= pauseButtonY && y <= pauseButtonY + pauseButtonSize) {
      this.togglePause();
      return;
    }

    if (this.isPaused) return; // Don't handle other mouse events when paused
    
    this.isMouseDown = true;
    
    const clickedPuc = this.findPucAtPosition(x, y);
    if (clickedPuc) {
      this.startChain(clickedPuc);
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (this.isPaused) return; // Don't handle mouse events when paused
    
    if (!this.isMouseDown) return;
    this.isMouseDown = false;
    this.mousePosition = null; // Clear mouse position
    
    if (this.selectedPucs.length > 0) {
      this.removeSelectedPucs();
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isPaused) return; // Don't handle mouse events when paused
    
    this.mousePosition = this.getMousePosition(event);

    if (!this.isMouseDown || this.selectedPucs.length === 0) return;
    
    const hoveredPuc = this.findPucAtPosition(this.mousePosition.x, this.mousePosition.y);
    
    if (hoveredPuc && !hoveredPuc.selected) {
      const lastPuc = this.selectedPucs[this.selectedPucs.length - 1];
      // Allow connection if Pucs are of the same type and within range
      // Don't check for blinking state here, as we want to allow connections to blinking Pucs
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
    
    // Scale connection range based on puc sizes with max visual size limit
    const puc1Scale = Math.min(
      this.MAX_VISUAL_SIZE,
      Math.pow(this.TIER_SCALE_FACTOR, puc1.tier - 1)
    );
    const puc2Scale = Math.min(
      this.MAX_VISUAL_SIZE,
      Math.pow(this.TIER_SCALE_FACTOR, puc2.tier - 1)
    );
    const averageScale = (puc1Scale + puc2Scale) / 2;
    
    // Allow connection if Pucs are of the same type and within range
    // Don't check for blinking state here, as we want to allow connections to blinking Pucs
    return puc1.type === puc2.type && 
           distance <= this.PUC_RADIUS * this.CONNECTION_RANGE * averageScale;
  }

  private removeSelectedPucs(): void {
    const count = this.selectedPucs.length;
    if (count < 1) return;
    
    // Increment combo counter for successful combinations
    if (count > 1) {
      this.comboCount++;
      this.lastComboTime = Date.now();
    }
    
    // Calculate total tier value of combined Pucs
    let totalTier = this.selectedPucs.reduce((sum, puc) => sum + puc.tier, 0);
    
    // Calculate points based on tiers and chain length
    let totalPoints = 0;
    for (const puc of this.selectedPucs) {
      const tierMultiplier = 1 + ((puc.tier - 1) * 0.1);
      const basePoints = 10 * tierMultiplier;
      totalPoints += basePoints;
    }

    // Apply chain bonus for multiple pucs
    if (count > 1) {
      const chainMultiplier = Math.min(this.MAX_CHAIN_MULTIPLIER, 1 + ((count - 1) * 0.25));
      totalPoints *= chainMultiplier;
    } else {
      totalPoints *= this.SINGLE_TAP_POINT_MULTIPLIER;
    }

    // Apply fever multiplier if active
    if (this.feverMode) {
      totalPoints *= 2;
    }
    
    // Check if any of the selected Pucs is blinking (about to explode)
    const blinkingPuc = this.selectedPucs.find(puc => puc.blinking && puc.blinkStartTime);
    if (blinkingPuc) {
      // Reset the explosion timer by updating blinkStartTime
      blinkingPuc.blinkStartTime = Date.now();
      // Clear the selection to prevent further interactions
      this.clearSelection();
      return; // Don't proceed with normal combination
    }
    
    // Get the last Puc's position for the combined Puc
    const lastPuc = this.selectedPucs[count - 1];
    const combinedX = lastPuc.x;
    const combinedY = lastPuc.y;

    // Start sequential combination animation
    const animationDuration = 100; // 100ms for each combination step
    let currentStep = 0;
    
    // Mark first Puc as the starting point
    this.selectedPucs[0].combining = true;
    this.selectedPucs[0].combineStartTime = Date.now();
    this.selectedPucs[0].targetX = this.selectedPucs[1]?.x || combinedX;
    this.selectedPucs[0].targetY = this.selectedPucs[1]?.y || combinedY;

    const combineNext = () => {
      if (currentStep >= count - 1) {
        // All Pucs have been combined, create the final Puc
        if (totalTier > this.EXPLOSION_THRESHOLD) {
          // Create new combined Puc
          const newPuc = {
            x: combinedX,
            y: combinedY,
            vx: 0,
            vy: 0,
            type: this.selectedPucs[0].type,
            color: this.selectedPucs[0].color,
            selected: false,
            image: this.selectedPucs[0].image,
            tier: totalTier,
            removing: false,
            scale: 1,
            blinking: true,  // Start blinking immediately
            blinkStartTime: Date.now()  // Set blink start time
          };
          
          // Remove old Pucs from the game state
          this.pucs = this.pucs.filter(p => !this.selectedPucs.includes(p));
          
          // Add new combined Puc
          this.pucs.push(newPuc);
          
          // Clear the selection to prevent further interactions
          this.clearSelection();
          
          // Schedule explosion after blinking
          setTimeout(() => {
            // Add to score after blinking completes
            this.score += Math.floor(totalPoints);
            
            // Add to fever gauge
            if (!this.feverMode) {
              let feverGain = 0;
              if (count === 1) {
                feverGain = 0.5;
              } else {
                feverGain = count + Math.floor(totalPoints / 2);
              }
              
              this.feverGauge = Math.min(this.FEVER_THRESHOLD, this.feverGauge + feverGain);
              
              if (this.feverGauge >= this.FEVER_THRESHOLD) {
                this.activateFeverMode();
              }
            }

            // Create explosion effect
            this.explosions.push({
              x: combinedX,
              y: combinedY,
              startTime: Date.now(),
              color: newPuc.color,
              maxRadius: this.PUC_RADIUS * 5 // Larger explosion radius
            });

            // Explosion effect
            const explosionRadius = this.PUC_RADIUS * 3;
            const affectedPucs = this.pucs.filter(puc => {
              if (!puc.removing && puc !== newPuc) {
                const dx = puc.x - combinedX;
                const dy = puc.y - combinedY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return distance <= explosionRadius;
              }
              return false;
            });

            // Calculate total tier value to distribute (half of exploded Puc's tier)
            const tierToDistribute = Math.floor(totalTier / 2);
            
            if (affectedPucs.length > 0) {
              // Distribute tier value among affected Pucs
              const tierPerPuc = Math.floor(tierToDistribute / affectedPucs.length);
              const remainingTier = tierToDistribute % affectedPucs.length;
              
              // Add base tier to each Puc
              affectedPucs.forEach(puc => {
                puc.tier = Math.min(puc.tier + tierPerPuc, this.MAX_TIER);
              });
              
              // Distribute remaining tier value
              if (remainingTier > 0) {
                // Sort Pucs by distance to center to prioritize closer ones
                affectedPucs.sort((a, b) => {
                  const distA = Math.sqrt(Math.pow(a.x - combinedX, 2) + Math.pow(a.y - combinedY, 2));
                  const distB = Math.sqrt(Math.pow(b.x - combinedX, 2) + Math.pow(b.y - combinedY, 2));
                  return distA - distB;
                });
                
                // Add remaining tier to closest Pucs
                for (let i = 0; i < remainingTier; i++) {
                  if (i < affectedPucs.length) {
                    affectedPucs[i].tier = Math.min(affectedPucs[i].tier + 1, this.MAX_TIER);
                  }
                }
              }
            }
            
            // Remove the combined Puc after explosion
            this.pucs = this.pucs.filter(p => p !== newPuc);
            
            // Spawn new Pucs to replace the exploded ones
            this.spawnQueue = count;
          }, 1000); // Blink for 1 second before exploding
        } else if (count > 1) {
          // Regular combination for multiple Pucs
          const newPuc = {
            x: combinedX,
            y: combinedY,
            vx: 0,
            vy: 0,
            type: this.selectedPucs[0].type,
            color: this.selectedPucs[0].color,
            selected: false,
            image: this.selectedPucs[0].image,
            tier: totalTier,
            removing: false,
            scale: 1,
            blinking: false,  // No blinking for regular combinations
            blinkStartTime: 0  // No blink timer for regular combinations
          };
          
          // Remove old Pucs from the game state
          this.pucs = this.pucs.filter(p => !this.selectedPucs.includes(p));
          
          // Add new combined Puc
          this.pucs.push(newPuc);
          
          // Clear the selection to prevent further interactions
          this.clearSelection();
          
          // Add to score immediately for regular combinations
          this.score += Math.floor(totalPoints);
          
          // Add to fever gauge
          if (!this.feverMode) {
            let feverGain = 0;
            if (count === 1) {
              feverGain = 0.5;
            } else {
              feverGain = count + Math.floor(totalPoints / 2);
            }
            
            this.feverGauge = Math.min(this.FEVER_THRESHOLD, this.feverGauge + feverGain);
            
            if (this.feverGauge >= this.FEVER_THRESHOLD) {
              this.activateFeverMode();
            }
          }
          
          // Spawn fewer new Pucs since we're combining
          this.spawnQueue = Math.max(1, count - 1);
        } else {
          // Single Puc removal - always spawn a new one
          const singlePuc = this.selectedPucs[0];
          
          // Create small explosion effect
          this.explosions.push({
            x: singlePuc.x,
            y: singlePuc.y,
            startTime: Date.now(),
            color: singlePuc.color,
            maxRadius: this.PUC_RADIUS * 2 // Smaller explosion radius for single Puc
          });
          
          this.pucs = this.pucs.filter(p => p !== singlePuc);
          this.spawnQueue = 1;  // Always spawn a new Puc when removing one
        }
        return;
      }

      // Move current Puc to next Puc's position
      const currentPuc = this.selectedPucs[currentStep];
      const nextPuc = this.selectedPucs[currentStep + 1];
      
      // Reset previous Puc's animation state
      if (currentStep > 0) {
        const prevPuc = this.selectedPucs[currentStep - 1];
        prevPuc.combining = false;
        prevPuc.removing = true;
        prevPuc.scale = 0.5;
      }
      
      // Animate current Puc to next Puc
      currentPuc.combining = true;
      currentPuc.combineStartTime = Date.now();
      currentPuc.targetX = nextPuc.x;
      currentPuc.targetY = nextPuc.y;
      
      // Mark next Puc as the target
      nextPuc.combining = true;
      nextPuc.combineStartTime = Date.now();
      nextPuc.targetX = combinedX;
      nextPuc.targetY = combinedY;
      
      currentStep++;
      setTimeout(combineNext, animationDuration);
    };

    // Start the sequential combination
    combineNext();
  }

  private activateFeverMode(): void {
    if (!this.feverMode) {  // Only activate if not already in fever mode
      console.log('STARTING fever mode');
      this.feverMode = true;
      this.feverStartTime = Date.now();
      this.feverEndTime = this.feverStartTime + this.FEVER_DURATION; // Set end time
      this.feverTimeLeft = this.FEVER_DURATION;
      this.feverGauge = this.FEVER_THRESHOLD;
      this.scoreAtFeverStart = this.score;
      console.log(`Fever started at: ${this.feverStartTime}, will end at: ${this.feverEndTime}`);
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
        console.log('Fever mode ended');
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
    this.lastUpdateTime = Date.now();
    const timer = setInterval(() => {
      if (!this.isPaused) {
        const currentTime = Date.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = currentTime;
        this.timeLeft = Math.max(0, this.timeLeft - deltaTime);
        
        if (this.timeLeft <= 0) {
          clearInterval(timer);
          this.gameOver();
        }
      }
    }, 16); // Update at ~60fps
  }

  private gameOver(): void {
    // Stop the game loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    // Check if current score is a high score
    this.checkHighScore();
    
    // Show end screen instead of alert
    this.showEndScreen = true;
    this.gameStarted = false;
  }

  private checkHighScore(): void {
    // Load high scores from local storage
    this.loadHighScores();
    
    // Check if the current score is higher than any existing high score
    // or if there are fewer than 5 high scores
    if (this.highScores.length < 5 || this.score > this.highScores[this.highScores.length - 1].score) {
      this.isHighScore = true;
    }
  }

  private loadHighScores(): void {
    const savedScores = localStorage.getItem('pucpucHighScores');
    if (savedScores) {
      this.highScores = JSON.parse(savedScores);
      // Sort high scores in descending order
      this.highScores.sort((a, b) => b.score - a.score);
    } else {
      this.highScores = [];
    }
  }

  saveHighScore(): void {
    if (!this.playerName.trim()) {
      // Don't save if name is empty
      return;
    }
    
    // Add new high score
    const newScore = {
      name: this.playerName.trim(),
      score: this.score,
      date: new Date().toISOString().split('T')[0] // Format: YYYY-MM-DD
    };
    
    this.highScores.push(newScore);
    
    // Sort and limit to top 5 scores
    this.highScores.sort((a, b) => b.score - a.score);
    if (this.highScores.length > 5) {
      this.highScores = this.highScores.slice(0, 5);
    }
    
    // Save to local storage
    localStorage.setItem('pucpucHighScores', JSON.stringify(this.highScores));
    
    // Hide high score input
    this.isHighScore = false;
  }

  restartGame(): void {
    this.showEndScreen = false;
    this.initializeGame();
    this.gameStarted = true;
    this.startGameLoop();
    this.startTimer();
  }

  goToMainMenu(): void {
    this.showEndScreen = false;
    // Reset any game state as needed
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
      if (puc.removing) {
        if (puc.combining && puc.combineStartTime && puc.targetX !== undefined && puc.targetY !== undefined) {
          // Handle combination animation
          const elapsed = Date.now() - puc.combineStartTime;
          const progress = Math.min(1, elapsed / 100); // 100ms animation duration
          
          // Ease-out animation
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          
          // Move Puc towards target
          puc.x = puc.x + (puc.targetX - puc.x) * easeProgress;
          puc.y = puc.y + (puc.targetY - puc.y) * easeProgress;
          
          // Scale down as it moves
          puc.scale = 1 - (easeProgress * 0.7); // Increased scale reduction
          
          // Remove Puc when it reaches its target
          if (progress >= 1) {
            this.pucs = this.pucs.filter(p => p !== puc);
          }
          
          continue;
        }
      }

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
        
        // Scale minimum distance based on both pucs' tiers with max visual size limit
        const puc1Scale = Math.min(
          this.MAX_VISUAL_SIZE,
          Math.pow(this.TIER_SCALE_FACTOR, puc1.tier - 1)
        );
        const puc2Scale = Math.min(
          this.MAX_VISUAL_SIZE,
          Math.pow(this.TIER_SCALE_FACTOR, puc2.tier - 1)
        );
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

      // Calculate current scale with max visual size limit
      const currentScale = Math.min(
        this.MAX_VISUAL_SIZE,
        Math.pow(this.TIER_SCALE_FACTOR, puc1.tier - 1)
      );
      
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
    
    // Fill the circle with a darker color during fever mode
    if (this.feverMode) {
      this.ctx.fillStyle = 'rgba(32, 73, 151, 0.4)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(32, 73, 151, 0.4)';
    } else {
      this.ctx.strokeStyle = '#FFCDD2';
    }
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

    // Draw pucs
    for (const puc of this.pucs) {
      this.drawPuc(puc);
    }

    // Draw connections on top of Pucs
    this.drawConnections();

    // Draw explosions
    this.drawExplosions();

    // Draw stars if in fever mode
    if (this.feverMode) {
      const currentTime = Date.now();
      for (let i = this.stars.length - 1; i >= 0; i--) {
        const star = this.stars[i];
        const elapsed = currentTime - star.startTime;
        const blinkPhase = Math.sin(elapsed / 1000 * star.speed);
        const opacity = 0.3 + (blinkPhase * 0.7); // Fade between 0.3 and 1

        this.ctx.beginPath();
        this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(173, 216, 230, ${opacity})`; // Light blue color
        this.ctx.fill();

        // Reset star if it's been too long
        if (elapsed > 10000) { // Reset every 10 seconds
          this.stars[i] = this.createStar();
        }
      }
    }

    // Draw UI
    this.drawUI();
  }

  private drawExplosions(): void {
    const currentTime = Date.now();
    
    // Draw and update explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      const elapsed = currentTime - explosion.startTime;
      const progress = Math.min(1, elapsed / this.EXPLOSION_DURATION);
      
      // Draw main explosion circle
      this.ctx.beginPath();
      this.ctx.arc(explosion.x, explosion.y, explosion.maxRadius * progress, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.5 * (1 - progress)) + ')';
      this.ctx.fill();
      
      // Draw particles
      for (let j = 0; j < this.EXPLOSION_PARTICLES; j++) {
        const angle = (j / this.EXPLOSION_PARTICLES) * Math.PI * 2;
        const distance = explosion.maxRadius * progress;
        const particleX = explosion.x + Math.cos(angle) * distance;
        const particleY = explosion.y + Math.sin(angle) * distance;
        
        this.ctx.beginPath();
        this.ctx.arc(particleX, particleY, 2 * (1 - progress), 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.8 * (1 - progress)) + ')';
        this.ctx.fill();
      }
      
      // Remove finished explosions
      if (progress >= 1) {
        this.explosions.splice(i, 1);
      }
    }
  }

  private drawUI(): void {
    // Draw score
    this.ctx.font = 'bold 24px Arial';
    this.ctx.fillStyle = '#333333';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Score: ${this.score}`, 20, 40 + this.HEADER_OFFSET);

    // Draw timer
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = Math.floor(this.timeLeft % 60);
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    this.ctx.font = 'bold 36px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(timeString, this.CANVAS_WIDTH / 2, 40 + this.HEADER_OFFSET);

    // Draw map mode target and progress if in map mode
    if (this.isMapMode) {
      // Draw target score
      this.ctx.font = 'bold 20px Arial';
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`Target: ${this.mapTargetScore}`, this.CANVAS_WIDTH - 20, 40 + this.HEADER_OFFSET);

      // Draw progress bar
      const progress = Math.min(1, this.score / this.mapTargetScore);
      const barWidth = 200;
      const barHeight = 15;
      const barX = this.CANVAS_WIDTH - barWidth - 20;
      const barY = 50 + this.HEADER_OFFSET;

      // Background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      this.ctx.fillRect(barX, barY, barWidth, barHeight);

      // Progress
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.fillRect(barX, barY, barWidth * progress, barHeight);

      // Star indicators
      const starSize = 15;
      const starSpacing = 5;
      const totalStarsWidth = (starSize * 3) + (starSpacing * 2);
      const starsStartX = barX + (barWidth - totalStarsWidth) / 2;

      for (let i = 0; i < 3; i++) {
        const starX = starsStartX + (i * (starSize + starSpacing));
        const starY = barY + barHeight + 10;
        
        // Draw star outline
        this.ctx.beginPath();
        this.ctx.moveTo(starX + starSize/2, starY);
        for (let j = 0; j < 5; j++) {
          const angle = (j * 4 * Math.PI / 5) - Math.PI / 2;
          const radius = j % 2 === 0 ? starSize/2 : starSize/4;
          this.ctx.lineTo(starX + starSize/2 + Math.cos(angle) * radius, 
                         starY + Math.sin(angle) * radius);
        }
        this.ctx.closePath();
        
        // Fill star if threshold reached
        if (progress >= this.STAR_THRESHOLDS[i]) {
          this.ctx.fillStyle = '#FFD700';
          this.ctx.fill();
        }
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.stroke();
      }
    }

    // Draw fever score if in fever mode
    if (this.feverMode) {
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.textAlign = 'center';
      const feverScore = this.score - this.scoreAtFeverStart;
      this.ctx.fillText(`Fever: ${feverScore}`, this.CANVAS_WIDTH / 2, 80 + this.HEADER_OFFSET);
    }

    // Draw pause button (moved down if in map mode)
    const pauseButtonSize = 30;
    const pauseButtonX = this.CANVAS_WIDTH - pauseButtonSize - 20;
    const pauseButtonY = this.isMapMode ? 90 + this.HEADER_OFFSET : 20 + this.HEADER_OFFSET;
    
    // Draw button background
    this.ctx.fillStyle = this.isPaused ? 'rgba(255, 107, 107, 0.7)' : 'rgba(255, 255, 255, 0.7)';
    this.ctx.fillRect(pauseButtonX, pauseButtonY, pauseButtonSize, pauseButtonSize);
    this.ctx.strokeStyle = this.isPaused ? '#FF6B6B' : '#333333';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(pauseButtonX, pauseButtonY, pauseButtonSize, pauseButtonSize);

    // Draw pause/play icon
    this.ctx.fillStyle = this.isPaused ? '#FF6B6B' : '#333333';
    if (this.isPaused) {
      // Play icon (triangle)
      this.ctx.beginPath();
      this.ctx.moveTo(pauseButtonX + 10, pauseButtonY + 5);
      this.ctx.lineTo(pauseButtonX + 10, pauseButtonY + pauseButtonSize - 5);
      this.ctx.lineTo(pauseButtonX + pauseButtonSize - 5, pauseButtonY + pauseButtonSize/2);
      this.ctx.closePath();
      this.ctx.fill();
    } else {
      // Pause icon (two rectangles)
      this.ctx.fillRect(pauseButtonX + 8, pauseButtonY + 5, 4, pauseButtonSize - 10);
      this.ctx.fillRect(pauseButtonX + 18, pauseButtonY + 5, 4, pauseButtonSize - 10);
    }

    // Draw combo counter
    if (this.comboCount > 0) {
      this.ctx.font = 'bold 20px Arial';
      this.ctx.fillStyle = '#333333';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`Combo: ${this.comboCount}`, this.CANVAS_WIDTH - 20, pauseButtonY + pauseButtonSize + 30);
    }

    // Draw fever gauge
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

    // Draw screen buttons
    const screen1Width = 100;
    const screen1Height = 140;
    const screen23Width = 140;
    const screen23Height = 100;
    const buttonSpacing = 20;
    const buttonsY = gaugeY + gaugeHeight + 40;

    // Screen 1 button (Leader Puc, vertical, left side)
    const screen1X = 20;
    const screen1Rotation = 5;
    this.ctx.save();
    this.ctx.translate(screen1X + screen1Width/2, buttonsY + screen1Height/2 - 45);
    this.ctx.rotate(screen1Rotation * Math.PI / 180);
    
    // Draw button background
    this.ctx.fillStyle = 'rgba(255, 107, 107, 0.7)';
    this.ctx.fillRect(-screen1Width/2, -screen1Height/2, screen1Width, screen1Height);
    this.ctx.strokeStyle = '#FF6B6B';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(-screen1Width/2, -screen1Height/2, screen1Width, screen1Height);

    // Draw selected leader puc if any
    if (this.selectedScreens['Leader Puc']) {
      const leaderImage = new Image();
      leaderImage.src = `assets/pucpuc/${this.getCharacterImageName(this.selectedScreens['Leader Puc'])}01.png`;
      this.ctx.drawImage(leaderImage, -screen1Width/3, -screen1Height/3, screen1Width/1.5, screen1Width/1.5);
      
      // Draw name
      this.ctx.font = 'bold 12px Arial';
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      const name = this.getCharacterName(this.selectedScreens['Leader Puc']).split(' ')[0];
      this.ctx.fillText(name, 0, screen1Height/3);
    } else {
      this.ctx.font = 'bold 16px Arial';
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Leader', 0, 0);
    }
    this.ctx.restore();

    // Screen 2 and 3 buttons (horizontal, centered)
    const totalButtonsWidth = (screen23Width * 2) + buttonSpacing;
    const startX = (this.CANVAS_WIDTH - totalButtonsWidth) / 2;

    // Screen 2 button (Ability 1)
    this.ctx.fillStyle = 'rgba(255, 107, 107, 0.7)';
    this.ctx.fillRect(startX, buttonsY, screen23Width, screen23Height);
    this.ctx.strokeStyle = '#FF6B6B';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(startX, buttonsY, screen23Width, screen23Height);
    
    if (this.selectedScreens['Ability 1']) {
      const ability1Image = new Image();
      ability1Image.src = `assets/ability/${this.selectedScreens['Ability 1'].replace('ability', '')}.png`;
      this.ctx.drawImage(ability1Image, startX + 10, buttonsY + 10, screen23Width - 20, screen23Height - 30);
      
      this.ctx.font = 'bold 12px Arial';
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      const name = this.getCharacterName(this.selectedScreens['Ability 1']).split(' ')[0];
      this.ctx.fillText(name, startX + screen23Width/2, buttonsY + screen23Height - 6);
    } else {
      this.ctx.font = 'bold 16px Arial';
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Ability 1', startX + screen23Width/2, buttonsY + screen23Height/2 + 7);
    }

    // Screen 3 button (Ability 2)
    this.ctx.fillStyle = 'rgba(255, 107, 107, 0.7)';
    this.ctx.fillRect(startX + screen23Width + buttonSpacing, buttonsY, screen23Width, screen23Height);
    this.ctx.strokeStyle = '#FF6B6B';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(startX + screen23Width + buttonSpacing, buttonsY, screen23Width, screen23Height);
    
    if (this.selectedScreens['Ability 2']) {
      const ability2Image = new Image();
      ability2Image.src = `assets/ability/${this.selectedScreens['Ability 2'].replace('ability', '')}.png`;
      this.ctx.drawImage(ability2Image, startX + screen23Width + buttonSpacing + 10, buttonsY + 10, screen23Width - 20, screen23Height - 30);
      
      this.ctx.font = 'bold 12px Arial';
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      const name = this.getCharacterName(this.selectedScreens['Ability 2']).split(' ')[0];
      this.ctx.fillText(name, startX + screen23Width + buttonSpacing + screen23Width/2, buttonsY + screen23Height - 6);
    } else {
      this.ctx.font = 'bold 16px Arial';
      this.ctx.fillStyle = 'white';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Ability 2', startX + screen23Width + buttonSpacing + screen23Width/2, buttonsY + screen23Height/2 + 7);
    }

    // Draw pause overlay if paused (moved to the end)
    if (this.isPaused) {
      // Semi-transparent overlay
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

      // Large pause icon in center
      const centerX = this.CANVAS_WIDTH / 2;
      const centerY = this.CANVAS_HEIGHT / 2;
      const iconSize = 100;
      
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.fillRect(centerX - iconSize/2, centerY - iconSize/2, iconSize, iconSize);
      this.ctx.strokeStyle = '#FF6B6B';
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(centerX - iconSize/2, centerY - iconSize/2, iconSize, iconSize);

      // Draw pause icon
      this.ctx.fillStyle = '#FF6B6B';
      this.ctx.fillRect(centerX - 30, centerY - 30, 20, 60);
      this.ctx.fillRect(centerX + 10, centerY - 30, 20, 60);
    }
  }

  private drawConnections(): void {
    if (this.selectedPucs.length < 1) return;

    // Draw lines between selected pucs
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 10;

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

    // Handle blinking effect
    let opacity = 1;
    if (puc.blinking) {
      const blinkTime = Date.now() - (puc.blinkStartTime || 0);
      const blinkPhase = Math.sin(blinkTime / 50); // Changed from 100ms to 50ms for faster blinking
      opacity = 0.5 + (blinkPhase * 0.5); // Fade between 0.5 and 1
    }

    // Draw the image with size based on tier
    if (puc.image) {
      // Calculate tier scale with max visual size limit
      const tierScale = Math.min(
        this.MAX_VISUAL_SIZE,
        Math.pow(this.TIER_SCALE_FACTOR, puc.tier - 1)
      );
      const size = this.PUC_RADIUS * 2 * scale * this.PUC_DISPLAY_SCALE * tierScale;
      
      this.ctx.save();
      this.ctx.translate(puc.x, puc.y);
      
      // Apply opacity for blinking effect
      this.ctx.globalAlpha = opacity;
      
      // Draw selection highlight if selected
      if (puc.selected) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, this.PUC_RADIUS * 1.2 * tierScale, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
      
      // Draw the image first
      this.ctx.drawImage(
        puc.image,
        -size/2,
        -size/2,
        size,
        size
      );
      
      // Draw tier number on any combined Puc when it's blinking
      if (puc.blinking && puc.blinkStartTime) {
        this.ctx.font = `bold ${14 + Math.min(puc.tier, 10)}px Arial`; // Limit font size growth
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
    if (this.isPaused) {
      // Only draw the UI when paused, don't update game state
      this.draw();
      return;
    }

    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;

    // Reset combo if no new combinations in 3 seconds
    if (this.comboCount > 0 && currentTime - this.lastComboTime > 3000) {
      this.comboCount = 0;
    }

    // Update fever mode
    this.updateFeverMode();

    // Update timer only if not paused
    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - deltaTime);
      
      // Check for game over
      if (this.timeLeft <= 0) {
        this.gameOver();
        return;  // Stop updating once game is over
      }
    }

    // Update physics and draw only if not paused
    this.updatePhysics();
    this.draw();
  }

  startGame(): void {
    if (!this.isLoadoutComplete()) {
      return;
    }
    
    this.gameStarted = true;
    this.initializeGame();
    this.startGameLoop();
    this.startTimer();

    // Add mouse event listeners
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    
    // Add touch event listeners
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      // Check if pause button was clicked
      const pauseButtonSize = 30;
      const pauseButtonX = this.CANVAS_WIDTH - pauseButtonSize - 20;
      const pauseButtonY = this.isMapMode ? 90 + this.HEADER_OFFSET : 20 + this.HEADER_OFFSET;
      
      if (x >= pauseButtonX && x <= pauseButtonX + pauseButtonSize &&
          y >= pauseButtonY && y <= pauseButtonY + pauseButtonSize) {
        this.togglePause();
        return;
      }

      if (this.isPaused) return; // Don't handle other touch events when paused
      
      this.isMouseDown = true;
      this.mouseX = x;
      this.mouseY = y;
      const clickedPuc = this.findPucAtPosition(x, y);
      if (clickedPuc) {
        this.startChain(clickedPuc);
      }
    });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isMouseDown = false;
      if (this.selectedPucs.length > 0) {
        this.removeSelectedPucs();
      }
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.isMouseDown || this.selectedPucs.length === 0) return;
      
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      this.mouseX = x;
      this.mouseY = y;
      
      const hoveredPuc = this.findPucAtPosition(x, y);
      if (hoveredPuc && !hoveredPuc.selected) {
        const lastPuc = this.selectedPucs[this.selectedPucs.length - 1];
        if (hoveredPuc.type === lastPuc.type && this.areAdjacent(lastPuc, hoveredPuc)) {
          this.addToChain(hoveredPuc);
        }
      }
    });
  }

  private handleTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    const { x, y } = this.getTouchPosition(touch);
    this.handleMouseDown(new MouseEvent('mousedown', { clientX: x, clientY: y }));
  }

  private handleTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const { x, y } = this.getTouchPosition(touch);
    this.handleMouseUp(new MouseEvent('mouseup', { clientX: x, clientY: y }));
  }

  private handleTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    const { x, y } = this.getTouchPosition(touch);
    this.handleMouseMove(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  }

  private getTouchPosition(touch: Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  private loadImages(): void {
    // Implementation of loadImages method
  }

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
    // If selecting an ability
    if (screenName === 'Ability 1' || screenName === 'Ability 2') {
      // If selecting the same ability that's already selected in the other slot, swap them
      if (screenName === 'Ability 1' && this.selectedScreens['Ability 2'] === option) {
        this.selectedScreens['Ability 2'] = this.selectedScreens['Ability 1'];
      } else if (screenName === 'Ability 2' && this.selectedScreens['Ability 1'] === option) {
        this.selectedScreens['Ability 1'] = this.selectedScreens['Ability 2'];
      }
    }
    
    // Update the selection
    this.selectedScreens[screenName] = option;
    this.saveLoadout();
  }

  isAbilityAvailable(ability: string, currentSlot: string): boolean {
    // If this is the currently selected ability in this slot, it's available
    if (this.selectedScreens[currentSlot] === ability) {
      return true;
    }
    
    // If the ability is selected in the other slot, it's not available
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

    const missing: string[] = [];
    if (!this.selectedScreens['Leader Puc']) missing.push('Leader PucPuc');
    if (!this.selectedScreens['Ability 1']) missing.push('Ability 1');
    if (!this.selectedScreens['Ability 2']) missing.push('Ability 2');

    return `Please select your ${missing.join(', ')}`;
  }

  handleStartButtonClick(): void {
    if (!this.isLoadoutComplete()) {
      const missing: string[] = [];
      if (!this.selectedScreens['Leader Puc']) missing.push('Leader PucPuc');
      if (!this.selectedScreens['Ability 1']) missing.push('Ability 1');
      if (!this.selectedScreens['Ability 2']) missing.push('Ability 2');

      alert(`Please equip your loadout first!\nMissing: ${missing.join(', ')}`);
    }
  }

  private loadSavedLoadout() {
    const savedLoadout = localStorage.getItem('pucsLoadout');
    if (savedLoadout) {
      try {
        const loadout = JSON.parse(savedLoadout);
        if (loadout.leaderPuc) {
          this.selectedScreens['Leader Puc'] = loadout.leaderPuc;
        }
        if (loadout.ability1) {
          this.selectedScreens['Ability 1'] = loadout.ability1;
        }
        if (loadout.ability2) {
          this.selectedScreens['Ability 2'] = loadout.ability2;
        }
      } catch (e) {
        console.error('Error loading saved loadout:', e);
      }
    }
  }

  private saveLoadout() {
    const loadout = {
      leaderPuc: this.selectedScreens['Leader Puc'],
      ability1: this.selectedScreens['Ability 1'],
      ability2: this.selectedScreens['Ability 2']
    };
    localStorage.setItem('pucsLoadout', JSON.stringify(loadout));
  }

  selectLeaderPuc(puc: any) {
    this.selectedLeaderPuc = puc;
    this.saveLoadout();
  }

  selectAbility1(ability: any) {
    this.selectedAbility1 = ability;
    this.saveLoadout();
  }

  selectAbility2(ability: any) {
    this.selectedAbility2 = ability;
    this.saveLoadout();
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.lastPauseTime = Date.now();
      // Clear any active selections when pausing
      this.clearSelection();
    } else {
      // Adjust the last update time to account for pause duration
      const pauseDuration = Date.now() - this.lastPauseTime;
      this.lastUpdateTime += pauseDuration;
    }
  }

  openLeaderboards(): void {
    this.loadHighScores();
    this.showLeaderboardsScreen = true;
  }

  closeLeaderboards(): void {
    this.showLeaderboardsScreen = false;
  }

  openMap(): void {
    this.showMapScreen = true;
  }

  closeMap(): void {
    this.showMapScreen = false;
  }
}