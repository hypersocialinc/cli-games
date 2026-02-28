# @hypersocial/cli-games

18 terminal games that run in any xterm.js terminal or directly in your CLI.

**Snake, Tetris, 2048, Pong, Asteroids, Space Invaders, Breakout, Frogger, Tron, Minesweeper, Wordle, Hangman, Simon, Runner, Tower, Typing Test, Crack, Chopper.**

Originally built as easter eggs for [HyperSpaces](https://hyperspaces.dev) — the terminal for AI coding agents. Play games while your agents ship code.

## Quick Start

```bash
# Play now — no install needed
npx @hypersocial/cli-games

# Launch a specific game
npx @hypersocial/cli-games snake

# With a color theme
npx @hypersocial/cli-games tetris --theme green
```

## Install

```bash
# Global install
npm install -g @hypersocial/cli-games
cli-games

# Or as a project dependency (for xterm.js integration)
npm install @hypersocial/cli-games
```

## CLI Usage

```bash
cli-games                    # Interactive game menu
cli-games <game>             # Launch a game directly
cli-games --theme <theme>    # Set color theme
cli-games --list             # List all games
cli-games --help             # Show help
```

### Available Themes

`cyan` (default), `amber`, `green`, `white`, `hotpink`, `blood`, `ice`, `bladerunner`, `tron`, `kawaii`, `oled`, `solarized`, `nord`, `highcontrast`, `banana`, `cream`, and their light variants (e.g. `cyanLight`).

## Library Usage (xterm.js)

```typescript
import { games, setTheme, runGame } from '@hypersocial/cli-games';

// Set the color theme
setTheme('cyan');

// Run a game in an xterm.js Terminal instance
const controller = runGame('snake', terminal);

// Stop the game
controller?.stop();

// Browse all games
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

- **Arrow keys** or **WASD** — Move / navigate
- **Enter** — Confirm / select
- **ESC** — Pause menu
- **Q** — Quit

## About

Built by [Selcuk Atli](https://x.com/selcukatli) at [HyperSocial App Studio](https://github.com/hypersocialinc).

These games are the easter eggs inside [HyperSpaces](https://hyperspaces.dev), a terminal built for developers running multiple AI coding agents across multiple projects. Think Discord for your terminals — projects in the dock, branches as channels, agents side by side.

## Contributing

Contributions welcome via pull requests. Add a new game, improve an existing one, or fix a bug.

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
