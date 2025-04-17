import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { PucsComponent } from './pucs.component';

interface Level {
  id: number;
  x: number;
  y: number;
  targetScore: number;
  stars: number;
  unlocked: boolean;
}

interface PlayerPosition {
  x: number;
  y: number;
  levelId: number;
}

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
  private playerPosition: PlayerPosition = { x: 0, y: 0, levelId: 1 };
  private readonly LEVEL_RADIUS = 30;
  private readonly PLAYER_RADIUS = 20;
  private readonly PATH_WIDTH = 8;
  private readonly STAR_RADIUS = 5;

  constructor(private pucsComponent: PucsComponent) {}

  ngOnInit(): void {
    // Initialize any component properties here
  }

  ngAfterViewInit() {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    
    // Add window resize listener
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Add mouse and touch event listeners
    this.canvas.addEventListener('click', (e) => this.handleMapClick(e));
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Prevent scrolling
      this.handleMapClick(e.touches[0]);
    });
    
    // Initial resize
    this.resizeCanvas();
    this.loadMapProgress();
    this.animate();
  }

  private resizeCanvas() {
    const container = this.canvas.parentElement;
    if (container) {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Set canvas size to match container
      this.canvas.width = containerWidth;
      this.canvas.height = containerHeight;
      
      // Recalculate level positions based on new canvas size
      const centerX = this.canvas.width / 2;
      const topY = 200; // Increased padding from top
      
      this.levels = [
        { id: 1, x: centerX, y: topY, targetScore: 10000, stars: 0, unlocked: true },
        { id: 2, x: centerX - 150, y: topY + 250, targetScore: 15000, stars: 0, unlocked: false },
        { id: 3, x: centerX + 150, y: topY + 250, targetScore: 20000, stars: 0, unlocked: false },
        { id: 4, x: centerX - 100, y: topY + 500, targetScore: 25000, stars: 0, unlocked: false },
        { id: 5, x: centerX + 100, y: topY + 500, targetScore: 30000, stars: 0, unlocked: false }
      ];
    }
  }

  private loadMapProgress() {
    const savedProgress = localStorage.getItem('pucsMapProgress');
    if (savedProgress) {
      const progress = JSON.parse(savedProgress);
      this.levels = progress.levels;
      this.playerPosition = progress.playerPosition;
    } else {
      // Initialize default levels with better spacing
      const centerX = this.canvas.width / 2;
      const topY = 200; // Increased padding from top
      
      this.levels = [
        { id: 1, x: centerX, y: topY, targetScore: 10000, stars: 0, unlocked: true },
        { id: 2, x: centerX - 150, y: topY + 250, targetScore: 15000, stars: 0, unlocked: false },
        { id: 3, x: centerX + 150, y: topY + 250, targetScore: 20000, stars: 0, unlocked: false },
        { id: 4, x: centerX - 100, y: topY + 500, targetScore: 25000, stars: 0, unlocked: false },
        { id: 5, x: centerX + 100, y: topY + 500, targetScore: 30000, stars: 0, unlocked: false }
      ];
      this.playerPosition = { x: this.levels[0].x, y: this.levels[0].y, levelId: this.levels[0].id };
    }
  }

  private animate() {
    this.drawMap();
    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  private drawMap() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw paths between levels
    this.ctx.strokeStyle = '#4CAF50';
    this.ctx.lineWidth = this.PATH_WIDTH;
    this.ctx.lineCap = 'round';
    
    for (let i = 0; i < this.levels.length - 1; i++) {
      if (this.levels[i].unlocked) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.levels[i].x, this.levels[i].y);
        this.ctx.lineTo(this.levels[i + 1].x, this.levels[i + 1].y);
        this.ctx.stroke();
      }
    }

    // Draw levels
    this.levels.forEach(level => {
      // Draw level circle
      this.ctx.beginPath();
      this.ctx.arc(level.x, level.y, this.LEVEL_RADIUS, 0, Math.PI * 2);
      this.ctx.fillStyle = level.unlocked ? '#4CAF50' : '#666';
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Draw level number
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(level.id.toString(), level.x, level.y);

      // Draw stars
      for (let i = 0; i < 3; i++) {
        this.ctx.beginPath();
        this.ctx.arc(
          level.x - 15 + i * 15,
          level.y + 25,
          this.STAR_RADIUS,
          0,
          Math.PI * 2
        );
        this.ctx.fillStyle = i < level.stars ? '#FFD700' : '#666';
        this.ctx.fill();
      }

      // Draw target score
      this.ctx.font = '14px Arial';
      this.ctx.fillStyle = '#fff';
      this.ctx.fillText(`${level.targetScore.toLocaleString()}`, level.x, level.y + 45);

      // Draw level info box if this is the current level
      if (level.id === this.playerPosition.levelId) {
        const boxWidth = 200;
        const boxHeight = 100;
        const boxX = level.x - boxWidth/2;
        const boxY = level.y - boxHeight - 20;

        // Draw box background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        this.ctx.strokeStyle = '#FF6B6B';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Draw level name
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = '#FF6B6B';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Level ${level.id}`, level.x, boxY + 25);

        // Draw objective
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(`Score ${level.targetScore.toLocaleString()}`, level.x, boxY + 50);
        this.ctx.fillText('to get 3 stars!', level.x, boxY + 70);
      }
    });

    // Draw player (leader Puc)
    if (this.pucsComponent.selectedScreens['Leader Puc']) {
      const leaderImage = new Image();
      leaderImage.src = `assets/pucpuc/${this.pucsComponent.getCharacterImageName(this.pucsComponent.selectedScreens['Leader Puc'])}01.png`;
      
      // Draw leader Puc image
      this.ctx.save();
      this.ctx.translate(this.playerPosition.x, this.playerPosition.y);
      this.ctx.drawImage(leaderImage, -30, -30, 60, 60);
      this.ctx.restore();
    } else {
      // Fallback to default player circle if no leader selected
      this.ctx.beginPath();
      this.ctx.arc(
        this.playerPosition.x,
        this.playerPosition.y,
        this.PLAYER_RADIUS,
        0,
        Math.PI * 2
      );
      this.ctx.fillStyle = '#2196F3';
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  handleMapClick(event: MouseEvent | Touch) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if clicked on a level
    const clickedLevel = this.levels.find(level => {
      const distance = Math.sqrt(
        Math.pow(x - level.x, 2) + Math.pow(y - level.y, 2)
      );
      return distance <= this.LEVEL_RADIUS;
    });

    if (clickedLevel && clickedLevel.unlocked) {
      this.startLevel(clickedLevel);
    }
  }

  private startLevel(level: Level) {
    this.pucsComponent.isMapMode = true;
    this.pucsComponent.mapTargetScore = level.targetScore;
    this.pucsComponent.mapStars = level.stars;
    this.playerPosition = { x: level.x, y: level.y, levelId: level.id };
    this.saveMapProgress();
    
    // Close map and start game
    this.pucsComponent.closeMap();
    this.pucsComponent.startGame();
  }

  private saveMapProgress() {
    const progress = {
      levels: this.levels,
      playerPosition: this.playerPosition
    };
    localStorage.setItem('pucsMapProgress', JSON.stringify(progress));
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    // Remove resize listener
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
} 