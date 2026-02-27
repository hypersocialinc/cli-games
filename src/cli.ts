/**
 * CLI entry point for @hypersocial/cli-games
 *
 * Provides a Node.js terminal adapter that maps stdin/stdout
 * to an xterm.js-compatible Terminal interface, allowing all
 * games to run directly in any terminal emulator.
 */

import { games, setTheme, type GameInfo } from './games';
import type { PhosphorMode } from './themes';

// ---------------------------------------------------------------------------
// Node Terminal Adapter
// ---------------------------------------------------------------------------

interface KeyEvent {
  key: string;
  domEvent: {
    key: string;
    preventDefault: () => void;
    stopPropagation: () => void;
  };
}

interface Disposable {
  dispose: () => void;
}

interface NodeTerminal {
  write: (data: string) => void;
  cols: number;
  rows: number;
  element: object;
  onKey: (callback: (event: KeyEvent) => void) => Disposable;
  onData: (callback: (data: string) => void) => Disposable;
  onResize: (callback: (size: { cols: number; rows: number }) => void) => Disposable;
}

/**
 * Parse raw stdin escape sequences into key names
 * compatible with DOM KeyboardEvent.key values
 */
function parseKey(data: string): string {
  // Arrow keys
  if (data === '\x1b[A' || data === '\x1bOA') return 'ArrowUp';
  if (data === '\x1b[B' || data === '\x1bOB') return 'ArrowDown';
  if (data === '\x1b[C' || data === '\x1bOC') return 'ArrowRight';
  if (data === '\x1b[D' || data === '\x1bOD') return 'ArrowLeft';

  // Special keys
  if (data === '\r' || data === '\n') return 'Enter';
  if (data === '\x1b') return 'Escape';
  if (data === ' ') return ' ';
  if (data === '\x7f' || data === '\b') return 'Backspace';
  if (data === '\t') return 'Tab';

  // Ctrl+C
  if (data === '\x03') return 'c';

  // Regular characters
  if (data.length === 1) return data;

  return data;
}

function createNodeTerminal(): NodeTerminal {
  const keyListeners: ((event: KeyEvent) => void)[] = [];
  const dataListeners: ((data: string) => void)[] = [];
  const resizeListeners: ((size: { cols: number; rows: number }) => void)[] = [];

  // Set up raw mode stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (data: string) => {
    // Ctrl+C always exits
    if (data === '\x03') {
      cleanup();
      process.exit(0);
    }

    const key = parseKey(data);
    const domEvent = {
      key,
      preventDefault: () => {},
      stopPropagation: () => {},
    };

    for (const listener of keyListeners) {
      listener({ key, domEvent });
    }

    for (const listener of dataListeners) {
      listener(data);
    }
  });

  process.stdout.on('resize', () => {
    const size = { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
    for (const listener of resizeListeners) {
      listener(size);
    }
  });

  function cleanup() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    // Restore terminal state
    process.stdout.write('\x1b[?1049l'); // Exit alternate buffer
    process.stdout.write('\x1b[?25h');   // Show cursor
    process.stdout.write('\x1b[0m');     // Reset colors
  }

  const terminal: NodeTerminal = {
    write: (data: string) => {
      process.stdout.write(data);
    },
    get cols() { return process.stdout.columns || 80; },
    get rows() { return process.stdout.rows || 24; },
    element: {}, // Truthy value for isTerminalValid check
    onKey: (callback: (event: KeyEvent) => void): Disposable => {
      keyListeners.push(callback);
      return {
        dispose: () => {
          const idx = keyListeners.indexOf(callback);
          if (idx !== -1) keyListeners.splice(idx, 1);
        }
      };
    },
    onData: (callback: (data: string) => void): Disposable => {
      dataListeners.push(callback);
      return {
        dispose: () => {
          const idx = dataListeners.indexOf(callback);
          if (idx !== -1) dataListeners.splice(idx, 1);
        }
      };
    },
    onResize: (callback: (size: { cols: number; rows: number }) => void): Disposable => {
      resizeListeners.push(callback);
      return {
        dispose: () => {
          const idx = resizeListeners.indexOf(callback);
          if (idx !== -1) resizeListeners.splice(idx, 1);
        }
      };
    },
  };

  // Clean up on exit
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  return terminal;
}

// ---------------------------------------------------------------------------
// CLI Menu
// ---------------------------------------------------------------------------

function showMenu(terminal: NodeTerminal) {
  let selectedIndex = 0;
  const themeColor = '\x1b[96m'; // Cyan
  const reset = '\x1b[0m';

  function render() {
    let output = '\x1b[2J\x1b[H'; // Clear screen

    const cols = terminal.cols;
    const rows = terminal.rows;

    // Title
    const title = [
      '█▀▀ █   █   █▀▀ ▄▀█ █▀▄▀█ █▀▀ █▀',
      '█▄▄ █▄▄ █   █▄█ █▀█ █ ▀ █ ██▄ ▄█',
    ];
    const titleX = Math.max(1, Math.floor((cols - title[0].length) / 2));
    output += `\x1b[2;${titleX}H${themeColor}\x1b[1m${title[0]}${reset}`;
    output += `\x1b[3;${titleX}H${themeColor}\x1b[1m${title[1]}${reset}`;

    const subtitle = `${games.length} terminal games — pick one to play`;
    output += `\x1b[5;${Math.max(1, Math.floor((cols - subtitle.length) / 2))}H\x1b[2m${subtitle}${reset}`;

    // Game list
    const startY = 7;
    const maxVisible = Math.min(games.length, rows - startY - 3);
    let scrollOffset = 0;
    if (selectedIndex >= scrollOffset + maxVisible) {
      scrollOffset = selectedIndex - maxVisible + 1;
    }
    if (selectedIndex < scrollOffset) {
      scrollOffset = selectedIndex;
    }

    for (let i = 0; i < maxVisible; i++) {
      const idx = scrollOffset + i;
      const game = games[idx];
      const isSelected = idx === selectedIndex;
      const prefix = isSelected ? '▶' : ' ';
      const style = isSelected ? '\x1b[1;93m' : '\x1b[2m';
      const numDisplay = idx + 1 <= 9 ? `${idx + 1}` : ' ';
      const line = `${prefix} [${numDisplay}] ${game.name.padEnd(18)} ${game.description}`;
      const lineX = Math.max(1, Math.floor((cols - 50) / 2));
      output += `\x1b[${startY + i};${lineX}H${style}${line}${reset}`;
    }

    // Controls
    const controls = '↑↓ Navigate | ENTER Play | 1-9 Quick Select | Q Quit';
    output += `\x1b[${rows - 1};${Math.max(1, Math.floor((cols - controls.length) / 2))}H\x1b[2m${controls}${reset}`;

    terminal.write(output);
  }

  // Enter alternate buffer
  terminal.write('\x1b[?1049h');
  terminal.write('\x1b[?25l');

  render();

  const keyListener = terminal.onKey(({ domEvent }) => {
    const key = domEvent.key;

    if (key === 'q' || key === 'Q') {
      keyListener.dispose();
      terminal.write('\x1b[?1049l');
      terminal.write('\x1b[?25h');
      process.exit(0);
    }

    if (key === 'ArrowUp') {
      selectedIndex = (selectedIndex - 1 + games.length) % games.length;
      render();
      return;
    }

    if (key === 'ArrowDown') {
      selectedIndex = (selectedIndex + 1) % games.length;
      render();
      return;
    }

    if (key === 'Enter') {
      keyListener.dispose();
      launchGame(terminal, games[selectedIndex]);
      return;
    }

    // Quick select 1-9
    const num = parseInt(key);
    if (num >= 1 && num <= 9 && num <= games.length) {
      keyListener.dispose();
      launchGame(terminal, games[num - 1]);
      return;
    }
  });
}

function launchGame(terminal: NodeTerminal, game: GameInfo) {
  // Clear screen before game
  terminal.write('\x1b[?1049l');
  terminal.write('\x1b[?25h');

  // Override window.dispatchEvent for CLI (games use it to signal quit/switch)
  const originalDispatchEvent = typeof globalThis.window !== 'undefined'
    ? globalThis.window?.dispatchEvent?.bind(globalThis.window)
    : undefined;

  // Create a mock window for event dispatching
  if (typeof globalThis.window === 'undefined') {
    (globalThis as Record<string, unknown>).window = {
      dispatchEvent: (event: Event) => {
        const customEvent = event as CustomEvent;
        if (customEvent.type === 'hypersurge:game-quit') {
          // Return to menu
          setTimeout(() => showMenu(terminal), 100);
        } else if (customEvent.type === 'hypersurge:random-game' || customEvent.type === 'hypersurge:games-menu') {
          // Return to menu
          setTimeout(() => showMenu(terminal), 100);
        }
        return true;
      },
      CustomEvent: CustomEvent,
    };
  } else if (originalDispatchEvent) {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.type.startsWith('hypersurge:')) {
        setTimeout(() => showMenu(terminal), 100);
      }
    };
    globalThis.window.addEventListener('hypersurge:game-quit', handler);
    globalThis.window.addEventListener('hypersurge:random-game', handler);
    globalThis.window.addEventListener('hypersurge:games-menu', handler);
  }

  // Run the game — cast terminal as any since it's API-compatible
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  game.run(terminal as any);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  // Parse theme flag
  let theme: PhosphorMode = 'cyan';
  const themeIdx = args.indexOf('--theme');
  if (themeIdx !== -1 && args[themeIdx + 1]) {
    theme = args[themeIdx + 1] as PhosphorMode;
    args.splice(themeIdx, 2);
  }
  setTheme(theme);

  // Direct game launch: cli-games snake
  const gameName = args[0];
  if (gameName) {
    const game = games.find(g => g.id === gameName || g.name.toLowerCase() === gameName.toLowerCase());
    if (!game) {
      console.error(`Unknown game: ${gameName}`);
      console.error(`Available games: ${games.map(g => g.id).join(', ')}`);
      process.exit(1);
      return; // unreachable, but helps TypeScript narrow the type
    }
    const terminal = createNodeTerminal();
    launchGame(terminal, game);
    return;
  }

  // Interactive menu
  const terminal = createNodeTerminal();
  showMenu(terminal);
}

main();
