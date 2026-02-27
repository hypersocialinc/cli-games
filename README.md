# @hypersocial/cli-games

18 terminal games that run in any xterm.js terminal or directly in your CLI.

**Snake, Tetris, 2048, Pong, Asteroids, Space Invaders, Breakout, Frogger, Tron, Minesweeper, Wordle, Hangman, Simon, Runner, Tower, Typing Test, Crack, Chopper.**

## CLI Usage

```bash
# Interactive menu
npx @hypersocial/cli-games

# Launch a specific game
npx @hypersocial/cli-games snake
npx @hypersocial/cli-games tetris

# Choose a color theme
npx @hypersocial/cli-games --theme green
npx @hypersocial/cli-games --theme amber snake
```

### Available Themes

`cyan` (default), `amber`, `green`, `white`, `hotpink`, `blood`, `ice`, `bladerunner`, `tron`, `kawaii`, `oled`, `solarized`, `nord`, `highcontrast`, `banana`, `cream`, and their light variants.

## Library Usage (xterm.js)

```bash
npm install @hypersocial/cli-games
```

```typescript
import { games, setTheme, runGame } from '@hypersocial/cli-games';

// Set the color theme
setTheme('cyan');

// Run a game in an xterm.js Terminal instance
const controller = runGame('snake', terminal);

// Stop the game
controller?.stop();

// Or use the games registry
for (const game of games) {
  console.log(`${game.id}: ${game.name} - ${game.description}`);
}
```

### Themes

```typescript
import {
  themes,
  getTheme,
  getAnsiColor,
  getTerminalTheme,
  type PhosphorMode,
} from '@hypersocial/cli-games/themes';

// Get a full xterm.js theme object
const xtermTheme = getTerminalTheme('cyan');
terminal.options.theme = xtermTheme;
```

## Games

| Game | Description |
|------|-------------|
| Tetris | Stack the blocks |
| Snake | Eat and grow |
| 2048 | Slide and combine tiles |
| Runner | Jump and duck |
| Pong | Classic paddle game |
| Wordle | Guess the word |
| Minesweeper | Clear the mines |
| Hangman | Guess the word |
| Space Invaders | Defend Earth |
| Tower | Build a tower |
| Simon | Memory game |
| Frogger | Cross the road |
| Breakout | Break all the bricks |
| Asteroids | Shoot the rocks |
| Typing Test | Test your speed |
| Tron | Light cycle battle |
| Crack | Hack the system |
| Chopper | Deliver passengers |

## Controls

- **Arrow keys** or **WASD** — Move/navigate
- **Enter** — Confirm/select
- **ESC** — Pause menu
- **Q** — Quit

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.

Contributions welcome via pull requests.
