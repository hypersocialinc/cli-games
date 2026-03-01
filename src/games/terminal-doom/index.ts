/**
 * Terminal Doom
 *
 * A DOOM-inspired first-person ASCII raycaster.
 * Explore maze levels, fight enemies, collect pickups.
 * Raycasting engine renders 3D perspective with Unicode shading.
 * Theme-aware with glitchy effects and visual polish.
 */

import type { Terminal } from '@xterm/xterm';
import { getCurrentThemeColor } from '../utils';
import { dispatchGameQuit, dispatchGameSwitch, dispatchGamesMenu } from '../gameTransitions';
import { PAUSE_MENU_ITEMS, renderSimpleMenu, navigateMenu } from '../shared/menu';
import {
  type Particle,
  type ScorePopup,
  updateParticles,
  updatePopups,
  createShakeState,
  triggerShake,
  applyShake,
} from '../shared/effects';

export interface TerminalDoomController {
  stop: () => void;
  isRunning: boolean;
}

// ============================================================================
// TYPES
// ============================================================================

interface Player {
  x: number;
  y: number;
  angle: number;     // radians
  health: number;
  maxHealth: number;
  ammo: number;
  maxAmmo: number;
  shootCooldown: number;
  hitFlash: number;
  bobPhase: number;   // weapon bob
}

interface Enemy {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  type: 'grunt' | 'soldier' | 'boss';
  state: 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead';
  angle: number;
  speed: number;
  attackCooldown: number;
  stateTimer: number;
  patrolTarget: { x: number; y: number } | null;
  deathTimer: number;
  sprites: string[];
}

interface Pickup {
  x: number;
  y: number;
  type: 'health' | 'ammo';
  collected: boolean;
}

interface Level {
  map: number[][];
  playerStart: { x: number; y: number; angle: number };
  enemies: Array<{ x: number; y: number; type: Enemy['type'] }>;
  pickups: Array<{ x: number; y: number; type: Pickup['type'] }>;
  exitX: number;
  exitY: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FOV = Math.PI / 3;       // 60 degree field of view
const MAX_DEPTH = 16;
const MOVE_SPEED = 0.06;
const TURN_SPEED = 0.05;
const STRAFE_SPEED = 0.04;
const PLAYER_RADIUS = 0.3;

const WALL_SHADES = ['█', '▓', '▒', '░', '·', ' '];
const FLOOR_CHARS = ['·', '.', ' '];
const CEILING_CHARS = [' ', ' ', ' '];

// Enemy sprite sets (near to far: large to small)
const ENEMY_SPRITES: Record<string, { near: string[]; mid: string[]; far: string }> = {
  grunt: {
    near: ['╔█╗', '║☻║', '╚╩╝'],
    mid: ['█☻█'],
    far: '☻',
  },
  soldier: {
    near: ['╔▓╗', '║☠║', '╚╩╝'],
    mid: ['▓☠▓'],
    far: '☠',
  },
  boss: {
    near: ['╔███╗', '║▓☠▓║', '║▓▓▓║', '╚═══╝'],
    mid: ['█☠█', '▓▓▓'],
    far: '☠',
  },
};

const ENEMY_COLORS: Record<string, string> = {
  grunt: '\x1b[92m',     // green
  soldier: '\x1b[91m',   // red
  boss: '\x1b[95m',      // magenta
};

const ENEMY_STATS: Record<string, { health: number; speed: number; damage: number }> = {
  grunt: { health: 2, speed: 0.02, damage: 8 },
  soldier: { health: 4, speed: 0.03, damage: 15 },
  boss: { health: 20, speed: 0.015, damage: 25 },
};

// ============================================================================
// LEVELS
// ============================================================================

function createLevels(): Level[] {
  // 0 = empty, 1-4 = wall types, 5 = door
  // Map is y-first indexing: map[y][x]

  const level1: Level = {
    map: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,2,2,2,0,0,0,0,3,3,3,0,0,1],
      [1,0,0,2,0,0,0,0,0,0,0,0,3,0,0,1],
      [1,0,0,2,0,0,0,0,0,0,0,0,3,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,3,0,0,0,0,0,0,0,0,2,0,0,1],
      [1,0,0,3,0,0,0,0,0,0,0,0,2,0,0,1],
      [1,0,0,3,3,3,0,0,0,0,2,2,2,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    playerStart: { x: 2.5, y: 2.5, angle: 0 },
    enemies: [
      { x: 7.5, y: 7.5, type: 'grunt' },
      { x: 13.5, y: 5.5, type: 'grunt' },
      { x: 4.5, y: 10.5, type: 'grunt' },
    ],
    pickups: [
      { x: 7.5, y: 1.5, type: 'ammo' },
      { x: 1.5, y: 14.5, type: 'health' },
      { x: 14.5, y: 14.5, type: 'ammo' },
    ],
    exitX: 14,
    exitY: 14,
  };

  const level2: Level = {
    map: [
      [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
      [2,0,0,0,2,0,0,0,0,0,0,2,0,0,0,2],
      [2,0,0,0,2,0,0,0,0,0,0,2,0,0,0,2],
      [2,0,0,0,0,0,0,3,3,0,0,0,0,0,0,2],
      [2,2,2,0,0,0,0,0,0,0,0,0,0,2,2,2],
      [2,0,0,0,0,3,0,0,0,0,3,0,0,0,0,2],
      [2,0,0,0,0,3,0,0,0,0,3,0,0,0,0,2],
      [2,0,0,3,0,0,0,0,0,0,0,0,3,0,0,2],
      [2,0,0,3,0,0,0,0,0,0,0,0,3,0,0,2],
      [2,0,0,0,0,3,0,0,0,0,3,0,0,0,0,2],
      [2,0,0,0,0,3,0,0,0,0,3,0,0,0,0,2],
      [2,2,2,0,0,0,0,0,0,0,0,0,0,2,2,2],
      [2,0,0,0,0,0,0,3,3,0,0,0,0,0,0,2],
      [2,0,0,0,2,0,0,0,0,0,0,2,0,0,0,2],
      [2,0,0,0,2,0,0,0,0,0,0,2,0,0,0,2],
      [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    ],
    playerStart: { x: 1.5, y: 1.5, angle: Math.PI / 4 },
    enemies: [
      { x: 7.5, y: 7.5, type: 'soldier' },
      { x: 14.5, y: 1.5, type: 'grunt' },
      { x: 1.5, y: 14.5, type: 'grunt' },
      { x: 14.5, y: 14.5, type: 'soldier' },
      { x: 7.5, y: 3.5, type: 'grunt' },
    ],
    pickups: [
      { x: 7.5, y: 1.5, type: 'health' },
      { x: 7.5, y: 14.5, type: 'ammo' },
      { x: 1.5, y: 7.5, type: 'health' },
      { x: 14.5, y: 7.5, type: 'ammo' },
    ],
    exitX: 14,
    exitY: 14,
  };

  const level3: Level = {
    map: [
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
      [3,0,0,0,0,0,3,0,0,3,0,0,0,0,0,3],
      [3,0,3,3,0,0,3,0,0,3,0,0,3,3,0,3],
      [3,0,3,0,0,0,0,0,0,0,0,0,0,3,0,3],
      [3,0,0,0,0,3,0,0,0,0,3,0,0,0,0,3],
      [3,0,0,3,0,3,0,0,0,0,3,0,3,0,0,3],
      [3,3,0,0,0,0,0,0,0,0,0,0,0,0,3,3],
      [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
      [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
      [3,3,0,0,0,0,0,0,0,0,0,0,0,0,3,3],
      [3,0,0,3,0,3,0,0,0,0,3,0,3,0,0,3],
      [3,0,0,0,0,3,0,0,0,0,3,0,0,0,0,3],
      [3,0,3,0,0,0,0,0,0,0,0,0,0,3,0,3],
      [3,0,3,3,0,0,3,0,0,3,0,0,3,3,0,3],
      [3,0,0,0,0,0,3,0,0,3,0,0,0,0,0,3],
      [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    ],
    playerStart: { x: 1.5, y: 1.5, angle: Math.PI / 4 },
    enemies: [
      { x: 7.5, y: 7.5, type: 'boss' },
      { x: 14.5, y: 1.5, type: 'soldier' },
      { x: 1.5, y: 14.5, type: 'soldier' },
      { x: 14.5, y: 14.5, type: 'soldier' },
      { x: 4.5, y: 7.5, type: 'grunt' },
      { x: 11.5, y: 7.5, type: 'grunt' },
      { x: 7.5, y: 4.5, type: 'grunt' },
      { x: 7.5, y: 11.5, type: 'grunt' },
    ],
    pickups: [
      { x: 1.5, y: 7.5, type: 'health' },
      { x: 14.5, y: 7.5, type: 'health' },
      { x: 7.5, y: 1.5, type: 'ammo' },
      { x: 7.5, y: 14.5, type: 'ammo' },
      { x: 3.5, y: 3.5, type: 'health' },
      { x: 12.5, y: 12.5, type: 'ammo' },
    ],
    exitX: 14,
    exitY: 14,
  };

  return [level1, level2, level3];
}

// ============================================================================
// WALL COLORS
// ============================================================================

const WALL_COLORS: Record<number, { ns: string; ew: string }> = {
  1: { ns: '\x1b[37m', ew: '\x1b[90m' },      // gray / dark gray
  2: { ns: '\x1b[91m', ew: '\x1b[31m' },       // bright red / red
  3: { ns: '\x1b[94m', ew: '\x1b[34m' },       // bright blue / blue
  4: { ns: '\x1b[93m', ew: '\x1b[33m' },       // bright yellow / yellow
  5: { ns: '\x1b[95m', ew: '\x1b[35m' },       // door: magenta
};

// ============================================================================
// MAIN GAME FUNCTION
// ============================================================================

export function runTerminalDoomGame(terminal: Terminal): TerminalDoomController {
  const themeColor = getCurrentThemeColor();

  const MIN_COLS = 60;
  const MIN_ROWS = 24;

  // State
  let running = true;
  let gameStarted = false;
  let gameOver = false;
  let paused = false;
  let pauseMenuSelection = 0;
  let won = false;
  let score = 0;
  let highScore = 0;

  // Visual effects
  let glitchFrame = 0;
  let particles: Particle[] = [];
  let scorePopups: ScorePopup[] = [];
  const shake = createShakeState();

  // Game state
  const levels = createLevels();
  let currentLevel = 0;
  let levelMap: number[][] = [];
  let player: Player = {
    x: 0, y: 0, angle: 0,
    health: 100, maxHealth: 100,
    ammo: 30, maxAmmo: 60,
    shootCooldown: 0,
    hitFlash: 0,
    bobPhase: 0,
  };
  let enemies: Enemy[] = [];
  let pickups: Pickup[] = [];
  let keysDown: Set<string> = new Set();
  let killCount = 0;
  let totalKills = 0;
  let levelTransition = 0;
  let levelTransitionMsg = '';
  let shootFlash = 0;
  let crosshairFlash = 0;

  // Depth buffer for sprite rendering
  let depthBuffer: number[] = [];

  // View dimensions (computed from terminal size)
  let viewWidth = 60;
  let viewHeight = 20;

  const controller: TerminalDoomController = {
    stop: () => {
      if (!running) return;
      running = false;
    },
    get isRunning() { return running; },
  };

  // -------------------------------------------------------------------------
  // ASCII ART TITLE
  // -------------------------------------------------------------------------
  const title = [
    '▀█▀ █▀▀ █▀█ █▀▄▀█ █ █▄ █ ▄▀█ █',
    '░█░ ██▄ █▀▄ █░▀░█ █ █░▀█ █▀█ █▄▄',
  ];
  const title2 = [
    '█▀▄ █▀█ █▀█ █▀▄▀█',
    '█▄▀ █▄█ █▄█ █░▀░█',
  ];

  // -------------------------------------------------------------------------
  // GAME LOGIC
  // -------------------------------------------------------------------------

  function initGame() {
    score = 0;
    killCount = 0;
    totalKills = 0;
    currentLevel = 0;
    gameOver = false;
    won = false;
    paused = false;
    particles = [];
    scorePopups = [];
    levelTransition = 0;

    player = {
      x: 0, y: 0, angle: 0,
      health: 100, maxHealth: 100,
      ammo: 30, maxAmmo: 60,
      shootCooldown: 0,
      hitFlash: 0,
      bobPhase: 0,
    };

    loadLevel(0);
  }

  function loadLevel(idx: number) {
    if (idx >= levels.length) {
      won = true;
      gameOver = true;
      score += 500;
      if (score > highScore) highScore = score;
      return;
    }

    currentLevel = idx;
    const lvl = levels[idx];
    levelMap = lvl.map.map(row => [...row]);

    player.x = lvl.playerStart.x;
    player.y = lvl.playerStart.y;
    player.angle = lvl.playerStart.angle;

    // Restore some health/ammo between levels
    player.health = Math.min(player.maxHealth, player.health + 30);
    player.ammo = Math.min(player.maxAmmo, player.ammo + 15);

    enemies = lvl.enemies.map(e => ({
      x: e.x,
      y: e.y,
      health: ENEMY_STATS[e.type].health,
      maxHealth: ENEMY_STATS[e.type].health,
      type: e.type,
      state: 'patrol' as const,
      angle: Math.random() * Math.PI * 2,
      speed: ENEMY_STATS[e.type].speed,
      attackCooldown: 0,
      stateTimer: 0,
      patrolTarget: null,
      deathTimer: 0,
      sprites: [],
    }));

    pickups = lvl.pickups.map(p => ({
      x: p.x,
      y: p.y,
      type: p.type,
      collected: false,
    }));

    killCount = 0;

    if (idx > 0) {
      levelTransition = 60;
      levelTransitionMsg = `LEVEL ${idx + 1}`;
    }
  }

  function isWall(x: number, y: number): boolean {
    const mx = Math.floor(x);
    const my = Math.floor(y);
    if (my < 0 || my >= levelMap.length || mx < 0 || mx >= levelMap[0].length) return true;
    return levelMap[my][mx] > 0;
  }

  function getMapValue(x: number, y: number): number {
    const mx = Math.floor(x);
    const my = Math.floor(y);
    if (my < 0 || my >= levelMap.length || mx < 0 || mx >= levelMap[0].length) return 1;
    return levelMap[my][mx];
  }

  function tryMove(ox: number, oy: number, dx: number, dy: number): { x: number; y: number } {
    let nx = ox + dx;
    let ny = oy + dy;

    // Slide along walls
    if (isWall(nx + PLAYER_RADIUS * Math.sign(dx), oy) || isWall(nx - PLAYER_RADIUS * Math.sign(dx), oy)) {
      nx = ox;
    }
    if (isWall(ox, ny + PLAYER_RADIUS * Math.sign(dy)) || isWall(ox, ny - PLAYER_RADIUS * Math.sign(dy))) {
      ny = oy;
    }

    // Final collision check
    if (isWall(nx, ny)) {
      return { x: ox, y: oy };
    }

    return { x: nx, y: ny };
  }

  function distanceTo(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const dist = distanceTo(x1, y1, x2, y2);
    const steps = Math.ceil(dist * 4);
    const dx = (x2 - x1) / steps;
    const dy = (y2 - y1) / steps;

    for (let i = 1; i < steps; i++) {
      if (isWall(x1 + dx * i, y1 + dy * i)) return false;
    }
    return true;
  }

  function shootPlayer() {
    if (player.ammo <= 0 || player.shootCooldown > 0) return;

    player.ammo--;
    player.shootCooldown = 8;
    shootFlash = 4;
    crosshairFlash = 3;

    // Raytrace for hit detection
    const dx = Math.cos(player.angle);
    const dy = Math.sin(player.angle);

    let hitEnemy: Enemy | null = null;
    let hitDist = MAX_DEPTH;

    for (const enemy of enemies) {
      if (enemy.state === 'dead') continue;

      // Check if enemy is roughly in front of player
      const ex = enemy.x - player.x;
      const ey = enemy.y - player.y;
      const dot = ex * dx + ey * dy;
      if (dot < 0) continue;

      // Perpendicular distance from ray to enemy center
      const cross = Math.abs(ex * dy - ey * dx);
      const enemyDist = distanceTo(player.x, player.y, enemy.x, enemy.y);
      const hitRadius = enemy.type === 'boss' ? 0.7 : 0.5;

      if (cross < hitRadius && enemyDist < hitDist) {
        if (hasLineOfSight(player.x, player.y, enemy.x, enemy.y)) {
          hitEnemy = enemy;
          hitDist = enemyDist;
        }
      }
    }

    if (hitEnemy) {
      hitEnemy.health--;
      hitEnemy.state = 'hurt';
      hitEnemy.stateTimer = 5;
      crosshairFlash = 6;

      if (hitEnemy.health <= 0) {
        hitEnemy.state = 'dead';
        hitEnemy.deathTimer = 20;
        const pts = hitEnemy.type === 'boss' ? 500 : hitEnemy.type === 'soldier' ? 100 : 50;
        score += pts;
        killCount++;
        totalKills++;
        triggerShake(shake, 6, 2);
      } else {
        triggerShake(shake, 3, 1);
      }
    }
  }

  function updateEnemies() {
    for (const enemy of enemies) {
      if (enemy.state === 'dead') {
        enemy.deathTimer--;
        continue;
      }

      if (enemy.attackCooldown > 0) enemy.attackCooldown--;

      if (enemy.state === 'hurt') {
        enemy.stateTimer--;
        if (enemy.stateTimer <= 0) {
          enemy.state = 'chase';
        }
        continue;
      }

      const dist = distanceTo(enemy.x, enemy.y, player.x, player.y);
      const canSee = dist < 10 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);

      if (canSee) {
        enemy.state = 'chase';
        enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);

        // Attack if close enough
        const attackRange = enemy.type === 'boss' ? 4 : 3;
        if (dist < attackRange && enemy.attackCooldown <= 0) {
          enemy.state = 'attack';
          enemy.attackCooldown = enemy.type === 'boss' ? 30 : 50;
          const dmg = ENEMY_STATS[enemy.type].damage;
          player.health -= dmg;
          player.hitFlash = 8;
          triggerShake(shake, 8, 3);

          if (player.health <= 0) {
            player.health = 0;
            gameOver = true;
            if (score > highScore) highScore = score;
          }
        }
      } else {
        // Patrol
        enemy.state = 'patrol';
        enemy.stateTimer++;

        if (!enemy.patrolTarget || enemy.stateTimer > 100) {
          const px = Math.floor(enemy.x) + (Math.random() - 0.5) * 4;
          const py = Math.floor(enemy.y) + (Math.random() - 0.5) * 4;
          if (!isWall(px, py)) {
            enemy.patrolTarget = { x: px, y: py };
            enemy.stateTimer = 0;
          }
        }

        if (enemy.patrolTarget) {
          enemy.angle = Math.atan2(
            enemy.patrolTarget.y - enemy.y,
            enemy.patrolTarget.x - enemy.x
          );
          const d = distanceTo(enemy.x, enemy.y, enemy.patrolTarget.x, enemy.patrolTarget.y);
          if (d < 0.5) enemy.patrolTarget = null;
        }
      }

      // Move enemy
      if (enemy.state === 'chase' || enemy.state === 'patrol') {
        const spd = enemy.state === 'chase' ? enemy.speed * 1.5 : enemy.speed;
        const dx = Math.cos(enemy.angle) * spd;
        const dy = Math.sin(enemy.angle) * spd;
        const newPos = tryMove(enemy.x, enemy.y, dx, dy);
        enemy.x = newPos.x;
        enemy.y = newPos.y;
      }
    }
  }

  function updatePickups() {
    for (const pickup of pickups) {
      if (pickup.collected) continue;

      const dist = distanceTo(player.x, player.y, pickup.x, pickup.y);
      if (dist < 0.6) {
        pickup.collected = true;
        if (pickup.type === 'health') {
          const healed = Math.min(25, player.maxHealth - player.health);
          player.health = Math.min(player.maxHealth, player.health + 25);
          if (healed > 0) {
            score += 10;
          }
        } else {
          const gained = Math.min(15, player.maxAmmo - player.ammo);
          player.ammo = Math.min(player.maxAmmo, player.ammo + 15);
          if (gained > 0) {
            score += 10;
          }
        }
      }
    }
  }

  function checkLevelComplete() {
    const lvl = levels[currentLevel];
    const dist = distanceTo(player.x, player.y, lvl.exitX + 0.5, lvl.exitY + 0.5);
    const allDead = enemies.every(e => e.state === 'dead');

    if (dist < 1.0 && allDead) {
      score += 200;
      loadLevel(currentLevel + 1);
    }
  }

  function update() {
    if (!gameStarted || gameOver || paused) return;

    updateParticles(particles);
    updatePopups(scorePopups);

    if (levelTransition > 0) {
      levelTransition--;
      return;
    }

    // Player movement based on held keys
    let moved = false;
    if (keysDown.has('ArrowUp') || keysDown.has('w')) {
      const dx = Math.cos(player.angle) * MOVE_SPEED;
      const dy = Math.sin(player.angle) * MOVE_SPEED;
      const p = tryMove(player.x, player.y, dx, dy);
      player.x = p.x;
      player.y = p.y;
      moved = true;
    }
    if (keysDown.has('ArrowDown') || keysDown.has('s')) {
      const dx = -Math.cos(player.angle) * MOVE_SPEED;
      const dy = -Math.sin(player.angle) * MOVE_SPEED;
      const p = tryMove(player.x, player.y, dx, dy);
      player.x = p.x;
      player.y = p.y;
      moved = true;
    }
    if (keysDown.has('ArrowLeft') || keysDown.has('a')) {
      player.angle -= TURN_SPEED;
    }
    if (keysDown.has('ArrowRight') || keysDown.has('d')) {
      player.angle += TURN_SPEED;
    }
    // Strafe with Q/E
    if (keysDown.has('q')) {
      const dx = Math.cos(player.angle - Math.PI / 2) * STRAFE_SPEED;
      const dy = Math.sin(player.angle - Math.PI / 2) * STRAFE_SPEED;
      const p = tryMove(player.x, player.y, dx, dy);
      player.x = p.x;
      player.y = p.y;
      moved = true;
    }
    if (keysDown.has('e')) {
      const dx = Math.cos(player.angle + Math.PI / 2) * STRAFE_SPEED;
      const dy = Math.sin(player.angle + Math.PI / 2) * STRAFE_SPEED;
      const p = tryMove(player.x, player.y, dx, dy);
      player.x = p.x;
      player.y = p.y;
      moved = true;
    }

    if (moved) {
      player.bobPhase += 0.15;
    }

    if (player.shootCooldown > 0) player.shootCooldown--;
    if (player.hitFlash > 0) player.hitFlash--;
    if (shootFlash > 0) shootFlash--;
    if (crosshairFlash > 0) crosshairFlash--;

    updateEnemies();
    updatePickups();
    checkLevelComplete();
  }

  // -------------------------------------------------------------------------
  // RAYCASTING ENGINE
  // -------------------------------------------------------------------------

  interface RayResult {
    distance: number;
    wallType: number;
    side: 0 | 1;  // 0 = NS wall, 1 = EW wall
    hitX: number;
    hitY: number;
  }

  function castRay(angle: number): RayResult {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    const deltaDistX = dx === 0 ? 1e10 : Math.abs(1 / dx);
    const deltaDistY = dy === 0 ? 1e10 : Math.abs(1 / dy);

    let stepX: number, stepY: number;
    let sideDistX: number, sideDistY: number;

    if (dx < 0) {
      stepX = -1;
      sideDistX = (player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
    }
    if (dy < 0) {
      stepY = -1;
      sideDistY = (player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
    }

    let side: 0 | 1 = 0;
    let depth = 0;

    while (depth < MAX_DEPTH) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      depth++;
      const val = getMapValue(mapX, mapY);
      if (val > 0) {
        let perpDist: number;
        if (side === 0) {
          perpDist = (mapX - player.x + (1 - stepX) / 2) / dx;
        } else {
          perpDist = (mapY - player.y + (1 - stepY) / 2) / dy;
        }

        return {
          distance: Math.max(0.001, perpDist),
          wallType: val,
          side,
          hitX: player.x + perpDist * dx,
          hitY: player.y + perpDist * dy,
        };
      }
    }

    return { distance: MAX_DEPTH, wallType: 0, side: 0, hitX: 0, hitY: 0 };
  }

  // -------------------------------------------------------------------------
  // RENDERING
  // -------------------------------------------------------------------------

  function renderView(cols: number, rows: number): string {
    // Compute view dimensions
    viewWidth = Math.min(cols - 2, 80);
    viewHeight = Math.min(rows - 6, 30);

    const viewLeft = Math.max(1, Math.floor((cols - viewWidth) / 2));
    const viewTop = 3;

    const { offsetX, offsetY } = applyShake(shake);
    const renderLeft = viewLeft + offsetX;
    const renderTop = viewTop + offsetY;

    let output = '';

    // Depth buffer for this frame
    depthBuffer = new Array(viewWidth).fill(MAX_DEPTH);

    // Cast rays for each column
    const halfFov = FOV / 2;

    for (let x = 0; x < viewWidth; x++) {
      const rayAngle = player.angle - halfFov + (x / viewWidth) * FOV;
      const ray = castRay(rayAngle);

      // Fix fish-eye effect
      const correctedDist = ray.distance * Math.cos(rayAngle - player.angle);
      depthBuffer[x] = correctedDist;

      // Calculate wall height
      const wallHeight = Math.min(viewHeight, Math.floor(viewHeight / correctedDist));
      const wallTop = Math.floor((viewHeight - wallHeight) / 2);
      const wallBottom = wallTop + wallHeight;

      // Get wall shade based on distance
      const shadeIdx = Math.min(
        WALL_SHADES.length - 1,
        Math.floor((correctedDist / MAX_DEPTH) * WALL_SHADES.length)
      );
      const shade = WALL_SHADES[shadeIdx];

      // Get wall color
      const wallColor = WALL_COLORS[ray.wallType] || WALL_COLORS[1];
      const color = ray.side === 0 ? wallColor.ns : wallColor.ew;

      for (let y = 0; y < viewHeight; y++) {
        const screenX = renderLeft + x;
        const screenY = renderTop + y;

        if (screenX < 1 || screenX > cols || screenY < 1 || screenY > rows) continue;

        if (y < wallTop) {
          // Ceiling
          const ceilDist = (viewHeight / 2 - y) / (viewHeight / 2);
          const ceilIdx = Math.min(CEILING_CHARS.length - 1, Math.floor((1 - ceilDist) * CEILING_CHARS.length));
          const ceilChar = CEILING_CHARS[ceilIdx];
          if (ceilChar !== ' ') {
            output += `\x1b[${screenY};${screenX}H\x1b[34m${ceilChar}\x1b[0m`;
          }
        } else if (y >= wallTop && y < wallBottom) {
          // Wall
          output += `\x1b[${screenY};${screenX}H${color}${shade}\x1b[0m`;
        } else {
          // Floor
          const floorDist = (y - viewHeight / 2) / (viewHeight / 2);
          const floorIdx = Math.min(FLOOR_CHARS.length - 1, Math.floor((1 - floorDist) * FLOOR_CHARS.length));
          const floorChar = FLOOR_CHARS[floorIdx];
          if (floorChar !== ' ') {
            output += `\x1b[${screenY};${screenX}H\x1b[2;32m${floorChar}\x1b[0m`;
          }
        }
      }
    }

    // Render sprites (enemies and pickups)
    output += renderSprites(renderLeft, renderTop, cols);

    // Shoot flash effect
    if (shootFlash > 0) {
      const flashY = renderTop + viewHeight - 2;
      const flashX = renderLeft + Math.floor(viewWidth / 2);
      output += `\x1b[${flashY};${flashX - 1}H\x1b[1;93m╺█╸\x1b[0m`;
      if (shootFlash > 2) {
        output += `\x1b[${flashY - 1};${flashX}H\x1b[1;97m║\x1b[0m`;
      }
    }

    // Crosshair
    const chX = renderLeft + Math.floor(viewWidth / 2);
    const chY = renderTop + Math.floor(viewHeight / 2);
    const chColor = crosshairFlash > 0 ? '\x1b[1;91m' : themeColor;
    output += `\x1b[${chY};${chX}H${chColor}+\x1b[0m`;

    // Weapon bob
    const bobOffset = Math.floor(Math.sin(player.bobPhase) * 0.5);
    const weaponY = renderTop + viewHeight - 1 + bobOffset;
    const weaponX = renderLeft + Math.floor(viewWidth / 2) - 2;
    if (weaponY >= renderTop && weaponY <= renderTop + viewHeight) {
      output += `\x1b[${weaponY};${weaponX}H${themeColor}╔═╤═╗\x1b[0m`;
      if (weaponY + 1 <= renderTop + viewHeight) {
        output += `\x1b[${weaponY + 1};${weaponX}H${themeColor}╚═╧═╝\x1b[0m`;
      }
    }

    // Hit flash overlay
    if (player.hitFlash > 0 && player.hitFlash % 2 === 0) {
      output += `\x1b[${renderTop};${renderLeft}H\x1b[41m${'░'.repeat(Math.min(viewWidth, 20))}\x1b[0m`;
    }

    return output;
  }

  function renderSprites(viewLeft: number, viewTop: number, cols: number): string {
    let output = '';

    // Collect all visible sprites
    interface SpriteEntry {
      x: number;
      y: number;
      dist: number;
      type: 'enemy' | 'pickup';
      data: Enemy | Pickup;
    }

    const sprites: SpriteEntry[] = [];

    for (const enemy of enemies) {
      if (enemy.state === 'dead' && enemy.deathTimer <= 0) continue;
      const dist = distanceTo(player.x, player.y, enemy.x, enemy.y);
      if (dist < MAX_DEPTH) {
        sprites.push({ x: enemy.x, y: enemy.y, dist, type: 'enemy', data: enemy });
      }
    }

    for (const pickup of pickups) {
      if (pickup.collected) continue;
      const dist = distanceTo(player.x, player.y, pickup.x, pickup.y);
      if (dist < MAX_DEPTH) {
        sprites.push({ x: pickup.x, y: pickup.y, dist, type: 'pickup', data: pickup });
      }
    }

    // Sort back to front
    sprites.sort((a, b) => b.dist - a.dist);

    for (const sprite of sprites) {
      // Calculate angle from player to sprite
      const spriteAngle = Math.atan2(sprite.y - player.y, sprite.x - player.x);
      let relAngle = spriteAngle - player.angle;

      // Normalize angle
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;

      // Check if in view
      if (Math.abs(relAngle) > FOV / 2 + 0.1) continue;

      // Screen X position
      const screenX = Math.floor(viewLeft + (relAngle / FOV + 0.5) * viewWidth);

      // Fix fish-eye for sprite distance
      const correctedDist = sprite.dist * Math.cos(spriteAngle - player.angle);

      // Screen size based on distance
      const spriteHeight = Math.floor(viewHeight / correctedDist);
      const spriteTop = Math.floor(viewTop + (viewHeight - spriteHeight) / 2);

      // Check depth buffer - only draw if closer than wall
      const bufIdx = screenX - viewLeft;
      if (bufIdx < 0 || bufIdx >= viewWidth) continue;
      if (correctedDist >= depthBuffer[bufIdx]) continue;

      if (sprite.type === 'enemy') {
        const enemy = sprite.data as Enemy;
        const color = enemy.state === 'hurt' ? '\x1b[1;97m' :
                      enemy.state === 'dead' ? '\x1b[2;91m' :
                      ENEMY_COLORS[enemy.type];

        const spriteSet = ENEMY_SPRITES[enemy.type];

        if (correctedDist < 2) {
          // Near: full sprite
          const lines = spriteSet.near;
          for (let i = 0; i < lines.length; i++) {
            const sy = spriteTop + Math.floor((i / lines.length) * spriteHeight);
            const sx = screenX - Math.floor(lines[i].length / 2);
            if (sy >= viewTop && sy < viewTop + viewHeight && sx >= 1 && sx <= cols) {
              output += `\x1b[${sy};${sx}H${color}${lines[i]}\x1b[0m`;
            }
          }
        } else if (correctedDist < 5) {
          // Mid
          const lines = spriteSet.mid;
          for (let i = 0; i < lines.length; i++) {
            const sy = spriteTop + Math.floor(spriteHeight / 2) + i;
            const sx = screenX - Math.floor(lines[i].length / 2);
            if (sy >= viewTop && sy < viewTop + viewHeight && sx >= 1 && sx <= cols) {
              output += `\x1b[${sy};${sx}H${color}${lines[i]}\x1b[0m`;
            }
          }
        } else {
          // Far: single character
          const sy = spriteTop + Math.floor(spriteHeight / 2);
          if (sy >= viewTop && sy < viewTop + viewHeight && screenX >= 1 && screenX <= cols) {
            const dim = correctedDist > 8 ? '\x1b[2m' : '';
            output += `\x1b[${sy};${screenX}H${dim}${color}${spriteSet.far}\x1b[0m`;
          }
        }
      } else {
        // Pickup
        const pickup = sprite.data as Pickup;
        const pColor = pickup.type === 'health' ? '\x1b[1;91m' : '\x1b[1;93m';
        const pChar = pickup.type === 'health' ? '♥' : '◆';
        const bobY = Math.floor(Math.sin(glitchFrame * 0.1) * 0.5);

        const sy = spriteTop + Math.floor(spriteHeight / 2) + bobY;
        if (sy >= viewTop && sy < viewTop + viewHeight && screenX >= 1 && screenX <= cols) {
          const dim = correctedDist > 6 ? '\x1b[2m' : '';
          output += `\x1b[${sy};${screenX}H${dim}${pColor}${pChar}\x1b[0m`;
        }
      }
    }

    return output;
  }

  function renderMinimap(cols: number, rows: number): string {
    let output = '';

    const mapSize = Math.min(11, Math.floor(rows / 3));
    const mapLeft = cols - mapSize - 2;
    const mapTop = 3;

    // Semi-transparent overlay
    for (let my = 0; my < mapSize; my++) {
      for (let mx = 0; mx < mapSize; mx++) {
        const worldX = Math.floor(player.x) - Math.floor(mapSize / 2) + mx;
        const worldY = Math.floor(player.y) - Math.floor(mapSize / 2) + my;

        const sx = mapLeft + mx;
        const sy = mapTop + my;

        if (sx < 1 || sx > cols || sy < 1 || sy > rows) continue;

        // Player position on minimap
        if (mx === Math.floor(mapSize / 2) && my === Math.floor(mapSize / 2)) {
          // Player direction indicator
          const dirChars = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
          const dirIdx = Math.round(((player.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
          output += `\x1b[${sy};${sx}H\x1b[1;97m${dirChars[dirIdx]}\x1b[0m`;
          continue;
        }

        // Check for enemies
        let hasEnemy = false;
        for (const enemy of enemies) {
          if (enemy.state === 'dead') continue;
          if (Math.floor(enemy.x) === worldX && Math.floor(enemy.y) === worldY) {
            hasEnemy = true;
            break;
          }
        }

        if (hasEnemy) {
          output += `\x1b[${sy};${sx}H\x1b[91m•\x1b[0m`;
          continue;
        }

        // Check for pickups
        let hasPickup = false;
        for (const pickup of pickups) {
          if (pickup.collected) continue;
          if (Math.floor(pickup.x) === worldX && Math.floor(pickup.y) === worldY) {
            hasPickup = true;
            break;
          }
        }

        if (hasPickup) {
          output += `\x1b[${sy};${sx}H\x1b[93m·\x1b[0m`;
          continue;
        }

        const val = getMapValue(worldX, worldY);
        if (val > 0) {
          output += `\x1b[${sy};${sx}H\x1b[2m█\x1b[0m`;
        } else if (worldX >= 0 && worldX < 16 && worldY >= 0 && worldY < 16) {
          // Check if this is the exit
          const lvl = levels[currentLevel];
          if (worldX === lvl.exitX && worldY === lvl.exitY) {
            output += `\x1b[${sy};${sx}H\x1b[1;92m◇\x1b[0m`;
          } else {
            output += `\x1b[${sy};${sx}H\x1b[2m·\x1b[0m`;
          }
        }
      }
    }

    return output;
  }

  function renderHUD(cols: number, rows: number): string {
    let output = '';
    const hudY = rows - 1;
    const hudLeft = Math.max(1, Math.floor((cols - viewWidth) / 2));

    // Health bar
    const healthPercent = player.health / player.maxHealth;
    const healthBarWidth = 15;
    const healthFilled = Math.ceil(healthPercent * healthBarWidth);
    const healthColor = healthPercent > 0.5 ? '\x1b[92m' : healthPercent > 0.25 ? '\x1b[93m' : '\x1b[91m';
    const healthBar = `${healthColor}${'█'.repeat(healthFilled)}${'░'.repeat(healthBarWidth - healthFilled)}\x1b[0m`;
    output += `\x1b[${hudY};${hudLeft}H\x1b[1;91m♥\x1b[0m ${healthBar} \x1b[97m${player.health}\x1b[0m`;

    // Ammo
    const ammoX = hudLeft + 25;
    output += `\x1b[${hudY};${ammoX}H\x1b[1;93m◆\x1b[0m \x1b[97m${player.ammo}\x1b[2m/${player.maxAmmo}\x1b[0m`;

    // Score
    const scoreStr = `SCORE: ${score.toString().padStart(5, '0')}`;
    const scoreX = hudLeft + 40;
    output += `\x1b[${hudY};${scoreX}H${themeColor}${scoreStr}\x1b[0m`;

    // Level indicator
    const lvlStr = `LVL ${currentLevel + 1}/${levels.length}`;
    const lvlX = hudLeft + viewWidth - lvlStr.length;
    output += `\x1b[${hudY};${lvlX}H${themeColor}${lvlStr}\x1b[0m`;

    // Enemy count
    const aliveEnemies = enemies.filter(e => e.state !== 'dead').length;
    const enemyStr = `☠ ${aliveEnemies}`;
    const enemyX = Math.floor(cols / 2) - Math.floor(enemyStr.length / 2);
    output += `\x1b[${hudY - 1};${enemyX}H\x1b[2m${themeColor}${enemyStr}\x1b[0m`;

    // Exit hint when all enemies dead
    if (aliveEnemies === 0 && !gameOver) {
      const exitHint = '[ FIND THE EXIT ◇ ]';
      const exitX = Math.floor((cols - exitHint.length) / 2);
      const flashColor = glitchFrame % 20 < 10 ? '\x1b[1;92m' : '\x1b[92m';
      output += `\x1b[${3 + viewHeight + 1};${exitX}H${flashColor}${exitHint}\x1b[0m`;
    }

    return output;
  }

  function render() {
    let output = '';
    output += '\x1b[2J\x1b[H';

    const cols = terminal.cols;
    const rows = terminal.rows;

    // Check minimum terminal size
    if (cols < MIN_COLS || rows < MIN_ROWS) {
      const msg1 = 'Terminal too small!';
      const needWidth = cols < MIN_COLS;
      const needHeight = rows < MIN_ROWS;
      const hint = needWidth && needHeight ? 'Make pane larger'
        : needWidth ? 'Make pane wider ->' : 'Make pane taller';
      const msg2 = `Need: ${MIN_COLS}x${MIN_ROWS}  Have: ${cols}x${rows}`;
      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2);
      output += `\x1b[${centerY - 1};${Math.max(1, centerX - Math.floor(msg1.length / 2))}H${themeColor}${msg1}\x1b[0m`;
      output += `\x1b[${centerY + 1};${Math.max(1, centerX - Math.floor(msg2.length / 2))}H\x1b[2m${msg2}\x1b[0m`;
      output += `\x1b[${centerY + 3};${Math.max(1, centerX - Math.floor(hint.length / 2))}H\x1b[1m${themeColor}${hint}\x1b[0m`;
      terminal.write(output);
      return;
    }

    // Glitch title
    glitchFrame = (glitchFrame + 1) % 120;
    const glitchOffset = glitchFrame >= 110 ? Math.floor(Math.random() * 3) - 1 : 0;
    const titleX = Math.floor((cols - title[0].length) / 2) + glitchOffset;
    const title2X = Math.floor((cols - title2[0].length) / 2) + glitchOffset;

    if (glitchFrame >= 110 && glitchFrame < 115) {
      output += `\x1b[1;${titleX}H\x1b[91m${title[0]}\x1b[0m`;
      output += `\x1b[2;${title2X + 1}H\x1b[96m${title2[0]}\x1b[0m`;
    } else {
      output += `\x1b[1;${titleX}H${themeColor}\x1b[1m${title[0]}\x1b[0m`;
      output += `\x1b[2;${title2X}H${themeColor}\x1b[1m${title2[0]}\x1b[0m`;
    }

    // PAUSE MENU
    if (paused) {
      // Render the view dimmed behind pause
      output += renderView(cols, rows);

      const pauseMsg = '══ PAUSED ══';
      const pauseCenterX = Math.floor(cols / 2);
      const pauseY = Math.floor(rows / 2) - 4;
      const pauseMsgX = pauseCenterX - Math.floor(pauseMsg.length / 2);
      output += `\x1b[${pauseY};${pauseMsgX}H\x1b[5m${themeColor}${pauseMsg}\x1b[0m`;

      output += renderSimpleMenu(PAUSE_MENU_ITEMS, pauseMenuSelection, {
        centerX: pauseCenterX,
        startY: pauseY + 2,
        showShortcuts: false,
      });

      const navHint = '↑↓ select   ENTER confirm';
      const navHintX = pauseCenterX - Math.floor(navHint.length / 2);
      output += `\x1b[${pauseY + 8};${navHintX}H\x1b[2m${themeColor}${navHint}\x1b[0m`;
    }
    // START SCREEN
    else if (!gameStarted) {
      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2) - 2;

      // Big ASCII art
      const doomArt = [
        '██████╗  ██████╗  ██████╗ ███╗   ███╗',
        '██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║',
        '██║  ██║██║   ██║██║   ██║██╔████╔██║',
        '██║  ██║██║   ██║██║   ██║██║╚██╔╝██║',
        '██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║',
        '╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝',
      ];

      for (let i = 0; i < doomArt.length; i++) {
        const artX = centerX - Math.floor(doomArt[i].length / 2);
        const color = (glitchFrame % 40 < 20) ? '\x1b[91m' : '\x1b[1;91m';
        output += `\x1b[${centerY - 3 + i};${artX}H${color}${doomArt[i]}\x1b[0m`;
      }

      const startMsg = '[ PRESS ANY KEY TO PLAY ]';
      const startX = centerX - Math.floor(startMsg.length / 2);
      output += `\x1b[${centerY + 5};${startX}H\x1b[5m${themeColor}${startMsg}\x1b[0m`;

      const controls = [
        'W/↑ Forward  S/↓ Back  A/← Turn Left  D/→ Turn Right',
        'Q Strafe Left  E Strafe Right  SPACE Shoot  ESC Pause',
      ];
      for (let i = 0; i < controls.length; i++) {
        const ctrlX = centerX - Math.floor(controls[i].length / 2);
        output += `\x1b[${centerY + 7 + i};${ctrlX}H\x1b[2m${themeColor}${controls[i]}\x1b[0m`;
      }

      if (highScore > 0) {
        const hsMsg = `HIGH SCORE: ${highScore}`;
        const hsX = centerX - Math.floor(hsMsg.length / 2);
        output += `\x1b[${centerY + 10};${hsX}H\x1b[2m${themeColor}${hsMsg}\x1b[0m`;
      }
    }
    // GAME OVER
    else if (gameOver) {
      output += renderView(cols, rows);

      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2);

      if (won) {
        const winMsg = '╔══ MISSION COMPLETE ══╗';
        const winX = centerX - Math.floor(winMsg.length / 2);
        output += `\x1b[${centerY - 2};${winX}H\x1b[1;92m${winMsg}\x1b[0m`;

        const statsMsg = `KILLS: ${totalKills}  SCORE: ${score}`;
        const statsX = centerX - Math.floor(statsMsg.length / 2);
        output += `\x1b[${centerY};${statsX}H${themeColor}${statsMsg}\x1b[0m`;
      } else {
        const overMsg = '╔══ YOU DIED ══╗';
        const overX = centerX - Math.floor(overMsg.length / 2);
        output += `\x1b[${centerY - 2};${overX}H\x1b[1;91m${overMsg}\x1b[0m`;

        const statsMsg = `KILLS: ${totalKills}  SCORE: ${score}`;
        const statsX = centerX - Math.floor(statsMsg.length / 2);
        output += `\x1b[${centerY};${statsX}H${themeColor}${statsMsg}\x1b[0m`;
      }

      const scoreLine = `HIGH: ${highScore}`;
      const scoreX = centerX - Math.floor(scoreLine.length / 2);
      output += `\x1b[${centerY + 1};${scoreX}H\x1b[2m${themeColor}${scoreLine}\x1b[0m`;

      const restart = '╚ [R] RESTART  [Q] QUIT ╝';
      const restartX = centerX - Math.floor(restart.length / 2);
      output += `\x1b[${centerY + 3};${restartX}H\x1b[2m${themeColor}${restart}\x1b[0m`;
    }
    // GAMEPLAY
    else {
      // Render 3D view
      output += renderView(cols, rows);

      // Minimap
      output += renderMinimap(cols, rows);

      // HUD
      output += renderHUD(cols, rows);

      // Level transition overlay
      if (levelTransition > 0) {
        const centerX = Math.floor(cols / 2);
        const centerY = Math.floor(rows / 2);
        const msgX = centerX - Math.floor(levelTransitionMsg.length / 2);
        const flashColor = levelTransition % 6 < 3 ? '\x1b[1;97m' : themeColor;
        output += `\x1b[${centerY};${msgX}H${flashColor}\x1b[1m${levelTransitionMsg}\x1b[0m`;
      }

      // Particles
      const viewLeft = Math.max(1, Math.floor((cols - viewWidth) / 2));
      const pViewTop = 3;
      for (const p of particles) {
        const screenX = Math.round(viewLeft + p.x);
        const screenY = Math.round(pViewTop + p.y);
        if (screenX > 0 && screenX <= cols && screenY > 0 && screenY <= rows) {
          const alpha = p.life > 5 ? '' : '\x1b[2m';
          output += `\x1b[${screenY};${screenX}H${alpha}${p.color}${p.char}\x1b[0m`;
        }
      }

      // Score popups
      for (const popup of scorePopups) {
        const screenX = Math.round(viewLeft + popup.x);
        const screenY = Math.round(pViewTop + popup.y);
        if (screenY > 0 && screenY <= rows) {
          const alpha = popup.frames > 10 ? '\x1b[1m' : '\x1b[2m';
          output += `\x1b[${screenY};${screenX}H${alpha}${popup.color}${popup.text}\x1b[0m`;
        }
      }
    }

    // Bottom hint
    const hint = gameStarted && !gameOver && !paused ? `HIGH: ${highScore}  [ ESC ] MENU` : '';
    if (hint) {
      const hintX = Math.floor((cols - hint.length) / 2);
      output += `\x1b[${rows};${hintX}H\x1b[2m${themeColor}${hint}\x1b[0m`;
    }

    terminal.write(output);
  }

  // -------------------------------------------------------------------------
  // GAME LOOP
  // -------------------------------------------------------------------------

  setTimeout(() => {
    if (!running) return;

    terminal.write('\x1b[?1049h');
    terminal.write('\x1b[?25l');

    initGame();
    gameStarted = false;

    const renderInterval = setInterval(() => {
      if (!running) { clearInterval(renderInterval); return; }
      render();
    }, 50);

    const gameInterval = setInterval(() => {
      if (!running) { clearInterval(gameInterval); return; }
      update();
    }, 50);

    const keyListener = terminal.onKey(({ domEvent }) => {
      if (!running) { keyListener.dispose(); return; }

      domEvent.preventDefault();
      domEvent.stopPropagation();

      const key = domEvent.key.toLowerCase();

      // Track keys held down
      keysDown.add(domEvent.key);

      // Auto-release after a short delay (terminal doesn't get keyup)
      setTimeout(() => {
        keysDown.delete(domEvent.key);
      }, 120);

      // ESC toggles pause
      if (key === 'escape') {
        if (!gameStarted) return;
        paused = !paused;
        if (paused) pauseMenuSelection = 0;
        return;
      }

      // Q handling - quit from non-gameplay states, strafe during gameplay
      if (key === 'q' && (paused || gameOver || !gameStarted)) {
        clearInterval(renderInterval);
        clearInterval(gameInterval);
        controller.stop();
        dispatchGameQuit(terminal);
        return;
      }

      // Start screen - any key starts
      if (!gameStarted && !paused) {
        gameStarted = true;
        return;
      }

      // Game over - R to restart
      if (gameOver) {
        if (key === 'r') {
          if (score > highScore) highScore = score;
          initGame();
          gameStarted = true;
        }
        return;
      }

      // Pause menu navigation
      if (paused) {
        const { newSelection, confirmed } = navigateMenu(
          pauseMenuSelection,
          PAUSE_MENU_ITEMS.length,
          key,
          domEvent
        );

        if (newSelection !== pauseMenuSelection) {
          pauseMenuSelection = newSelection;
          return;
        }

        if (confirmed) {
          switch (pauseMenuSelection) {
            case 0: paused = false; break;
            case 1: initGame(); gameStarted = true; paused = false; break;
            case 2:
              clearInterval(renderInterval);
              clearInterval(gameInterval);
              controller.stop();
              dispatchGameQuit(terminal);
              break;
            case 3:
              clearInterval(renderInterval);
              clearInterval(gameInterval);
              running = false;
              dispatchGamesMenu(terminal);
              break;
            case 4:
              clearInterval(renderInterval);
              clearInterval(gameInterval);
              running = false;
              dispatchGameSwitch(terminal);
              break;
          }
          return;
        }

        // Legacy shortcuts
        if (key === 'r') { initGame(); gameStarted = true; paused = false; }
        else if (key === 'l') { clearInterval(renderInterval); clearInterval(gameInterval); running = false; dispatchGamesMenu(terminal); }
        else if (key === 'n') { clearInterval(renderInterval); clearInterval(gameInterval); running = false; dispatchGameSwitch(terminal); }
        return;
      }

      // GAMEPLAY INPUT
      if (domEvent.key === ' ') {
        shootPlayer();
      }
    });

    // Clean up on stop
    const originalStop = controller.stop;
    controller.stop = () => {
      clearInterval(renderInterval);
      clearInterval(gameInterval);
      keyListener.dispose();
      originalStop();
    };
  }, 50);

  return controller;
}
