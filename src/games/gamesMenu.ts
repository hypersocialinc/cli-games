/**
 * Games Menu
 *
 * Interactive game selection menu accessible via ::games command
 * or by pressing L in any game's pause menu.
 */

import type { Terminal } from '@xterm/xterm';
import { getCurrentThemeColor, isLightTheme, enterAlternateBuffer, exitAlternateBuffer, forceExitAlternateBuffer, isTerminalValid } from './utils';
import { games } from './index';
import { playSelectTransition } from './gameTransitions';

export interface GamesMenuController {
  stop: () => void;
  isRunning: boolean;
}

export interface GamesMenuOptions {
  onGameSelect?: (gameId: string) => void;
  onQuit?: () => void;
}

/**
 * Show interactive games menu
 */
export function showGamesMenu(terminal: Terminal, optionsOrCallback?: GamesMenuOptions | ((gameId: string) => void)): GamesMenuController {
  // Support both options object and simple callback for backwards compatibility
  const options: GamesMenuOptions = typeof optionsOrCallback === 'function'
    ? { onGameSelect: optionsOrCallback }
    : optionsOrCallback || {};
  const { onGameSelect, onQuit } = options;
  const themeColor = getCurrentThemeColor();
  const lightTheme = isLightTheme();

  let running = true;
  let selectedIndex = 0;
  let scrollOffset = 0;

  const controller: GamesMenuController = {
    stop: () => {
      if (!running) return;
      running = false;
    },
    get isRunning() { return running; }
  };

  const title = [
    '\u2588 \u2588 \u2588\u2584\u2588 \u2588\u2580\u2588 \u2588\u2580\u2580 \u2588\u2580\u2588   \u2588\u2580\u2580 \u2584\u2580\u2588 \u2588\u2580\u2584\u2580\u2588 \u2588\u2580\u2580 \u2588\u2580',
    '\u2588\u2580\u2588  \u2588  \u2588\u2580  \u2588\u2588\u2584 \u2588\u2580\u2584   \u2588\u2584\u2588 \u2588\u2580\u2588 \u2588 \u2580 \u2588 \u2588\u2588\u2584 \u2584\u2588',
  ];

  function render(): void {
    let output = '';
    output += '\x1b[2J\x1b[H';

    const cols = terminal.cols;
    const rows = terminal.rows;

    // Title
    const titleX = Math.floor((cols - title[0].length) / 2);
    output += `\x1b[2;${titleX}H${themeColor}\x1b[1m${title[0]}\x1b[0m`;
    output += `\x1b[3;${titleX}H${themeColor}\x1b[1m${title[1]}\x1b[0m`;

    // Subtitle with game count
    const subtitle = `Select a game to play (${games.length} games)`;
    output += `\x1b[5;${Math.floor((cols - subtitle.length) / 2)}H\x1b[2m${subtitle}\x1b[0m`;

    // Determine if we should use 2 columns
    const boxWidth = 38;
    const columnGap = 2;
    const twoColumnWidth = boxWidth * 2 + columnGap;
    const useTwoColumns = cols >= twoColumnWidth + 8; // 8 for margins

    const listStartY = 6;
    const availableRows = rows - listStartY - 4;
    const maxVisibleGames = Math.max(1, Math.floor(availableRows / 2));

    if (useTwoColumns) {
      renderTwoColumns(output, cols, rows, boxWidth, columnGap, listStartY, maxVisibleGames);
    } else {
      renderSingleColumn(output, cols, rows, boxWidth, listStartY, maxVisibleGames);
    }
  }

  function renderSingleColumn(
    baseOutput: string,
    cols: number,
    rows: number,
    boxWidth: number,
    listStartY: number,
    maxVisibleGames: number
  ): void {
    let output = baseOutput;
    const boxX = Math.floor((cols - boxWidth) / 2);
    const visibleGames = Math.min(maxVisibleGames, games.length);

    // Adjust scroll offset to keep selected item visible
    if (selectedIndex < scrollOffset) {
      scrollOffset = selectedIndex;
    } else if (selectedIndex >= scrollOffset + visibleGames) {
      scrollOffset = selectedIndex - visibleGames + 1;
    }
    scrollOffset = Math.max(0, Math.min(scrollOffset, games.length - visibleGames));

    const hasScrollUp = scrollOffset > 0;
    const hasScrollDown = scrollOffset + visibleGames < games.length;

    // Top border
    const topScrollIndicator = hasScrollUp ? ' \u25b2 more ' : '\u2550'.repeat(8);
    const topBorderWidth = boxWidth - 2 - topScrollIndicator.length;
    const topLeftPad = Math.floor(topBorderWidth / 2);
    const topRightPad = topBorderWidth - topLeftPad;
    output += `\x1b[${listStartY};${boxX}H${themeColor}\u2554${'\u2550'.repeat(topLeftPad)}${hasScrollUp ? '\x1b[33m' : ''}${topScrollIndicator}${hasScrollUp ? themeColor : ''}${'\u2550'.repeat(topRightPad)}\u2557\x1b[0m`;

    // Render visible games
    for (let vi = 0; vi < visibleGames; vi++) {
      const i = scrollOffset + vi;
      const game = games[i];
      const y = listStartY + 1 + vi * 2;
      const isSelected = i === selectedIndex;

      output += renderGameEntry(game, i, isSelected, y, boxX, boxWidth);
    }

    // Bottom border
    const bottomY = listStartY + 1 + visibleGames * 2;
    const bottomScrollIndicator = hasScrollDown ? ' \u25bc more ' : '\u2550'.repeat(8);
    const bottomBorderWidth = boxWidth - 2 - bottomScrollIndicator.length;
    const bottomLeftPad = Math.floor(bottomBorderWidth / 2);
    const bottomRightPad = bottomBorderWidth - bottomLeftPad;
    output += `\x1b[${bottomY};${boxX}H${themeColor}\u255a${'\u2550'.repeat(bottomLeftPad)}${hasScrollDown ? '\x1b[33m' : ''}${bottomScrollIndicator}${hasScrollDown ? themeColor : ''}${'\u2550'.repeat(bottomRightPad)}\u255d\x1b[0m`;

    // Controls
    const controls = `\u2191\u2193 Navigate | ENTER Select | 1-9 Quick | Q Quit`;
    output += `\x1b[${rows - 1};${Math.floor((cols - controls.length) / 2)}H\x1b[2m${controls}\x1b[0m`;

    terminal.write(output);
  }

  function renderTwoColumns(
    baseOutput: string,
    cols: number,
    rows: number,
    boxWidth: number,
    columnGap: number,
    listStartY: number,
    maxVisibleGames: number
  ): void {
    let output = baseOutput;

    // With 2 columns, we can show 2x as many games
    const gamesPerColumn = Math.min(maxVisibleGames, Math.ceil(games.length / 2));

    // Calculate scroll based on rows of 2 games
    const selectedRow = Math.floor(selectedIndex / 2);
    if (selectedRow < scrollOffset) {
      scrollOffset = selectedRow;
    } else if (selectedRow >= scrollOffset + gamesPerColumn) {
      scrollOffset = selectedRow - gamesPerColumn + 1;
    }
    const maxScroll = Math.max(0, Math.ceil(games.length / 2) - gamesPerColumn);
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxScroll));

    const hasScrollUp = scrollOffset > 0;
    const hasScrollDown = (scrollOffset + gamesPerColumn) * 2 < games.length;

    // Calculate positions for two columns
    const totalWidth = boxWidth * 2 + columnGap;
    const startX = Math.floor((cols - totalWidth) / 2);
    const leftBoxX = startX;
    const rightBoxX = startX + boxWidth + columnGap;

    // Top borders
    const topScrollIndicator = hasScrollUp ? ' \u25b2 ' : '\u2550\u2550\u2550';
    const topBorderContent = boxWidth - 2 - topScrollIndicator.length;
    const topLeft = Math.floor(topBorderContent / 2);
    const topRight = topBorderContent - topLeft;

    output += `\x1b[${listStartY};${leftBoxX}H${themeColor}\u2554${'\u2550'.repeat(topLeft)}${hasScrollUp ? '\x1b[33m' : ''}${topScrollIndicator}${hasScrollUp ? themeColor : ''}${'\u2550'.repeat(topRight)}\u2557\x1b[0m`;
    output += `\x1b[${listStartY};${rightBoxX}H${themeColor}\u2554${'\u2550'.repeat(topLeft)}${hasScrollUp ? '\x1b[33m' : ''}${topScrollIndicator}${hasScrollUp ? themeColor : ''}${'\u2550'.repeat(topRight)}\u2557\x1b[0m`;

    // Render games in two columns
    for (let row = 0; row < gamesPerColumn; row++) {
      const leftIdx = (scrollOffset + row) * 2;
      const rightIdx = leftIdx + 1;
      const y = listStartY + 1 + row * 2;

      // Left column
      if (leftIdx < games.length) {
        output += renderGameEntry(games[leftIdx], leftIdx, leftIdx === selectedIndex, y, leftBoxX, boxWidth);
      } else {
        // Empty slot
        output += `\x1b[${y};${leftBoxX}H${themeColor}\u2551${' '.repeat(boxWidth - 2)}\u2551\x1b[0m`;
        output += `\x1b[${y + 1};${leftBoxX}H${themeColor}\u2551${' '.repeat(boxWidth - 2)}\u2551\x1b[0m`;
      }

      // Right column
      if (rightIdx < games.length) {
        output += renderGameEntry(games[rightIdx], rightIdx, rightIdx === selectedIndex, y, rightBoxX, boxWidth);
      } else {
        // Empty slot
        output += `\x1b[${y};${rightBoxX}H${themeColor}\u2551${' '.repeat(boxWidth - 2)}\u2551\x1b[0m`;
        output += `\x1b[${y + 1};${rightBoxX}H${themeColor}\u2551${' '.repeat(boxWidth - 2)}\u2551\x1b[0m`;
      }
    }

    // Bottom borders
    const bottomY = listStartY + 1 + gamesPerColumn * 2;
    const bottomScrollIndicator = hasScrollDown ? ' \u25bc ' : '\u2550\u2550\u2550';
    const bottomBorderContent = boxWidth - 2 - bottomScrollIndicator.length;
    const bottomLeft = Math.floor(bottomBorderContent / 2);
    const bottomRight = bottomBorderContent - bottomLeft;

    output += `\x1b[${bottomY};${leftBoxX}H${themeColor}\u255a${'\u2550'.repeat(bottomLeft)}${hasScrollDown ? '\x1b[33m' : ''}${bottomScrollIndicator}${hasScrollDown ? themeColor : ''}${'\u2550'.repeat(bottomRight)}\u255d\x1b[0m`;
    output += `\x1b[${bottomY};${rightBoxX}H${themeColor}\u255a${'\u2550'.repeat(bottomLeft)}${hasScrollDown ? '\x1b[33m' : ''}${bottomScrollIndicator}${hasScrollDown ? themeColor : ''}${'\u2550'.repeat(bottomRight)}\u255d\x1b[0m`;

    // Controls
    const controls = `\u2191\u2193\u2190\u2192 Navigate | ENTER Select | 1-9 Quick | Q Quit`;
    output += `\x1b[${rows - 1};${Math.floor((cols - controls.length) / 2)}H\x1b[2m${controls}\x1b[0m`;

    terminal.write(output);
  }

  function renderGameEntry(
    game: typeof games[number],
    index: number,
    isSelected: boolean,
    y: number,
    boxX: number,
    boxWidth: number
  ): string {
    let output = '';
    const contentWidth = boxWidth - 2; // Account for box borders on each side

    const prefix = isSelected ? '\u25b6' : ' ';
    const highlight = isSelected ? (lightTheme ? '\x1b[1;7;97m' : '\x1b[1;7m') : '';
    const keyColor = isSelected ? '' : '\x1b[33m';
    const keyNum = index + 1;
    const keyDisplay = keyNum <= 9 ? `${keyNum}` : ' ';

    // Build the line content
    const lineContent = `${prefix} [${keyDisplay}] ${game.name}`;
    const padding = Math.max(0, contentWidth - lineContent.length);

    output += `\x1b[${y};${boxX}H${themeColor}\u2551\x1b[0m${highlight}${keyColor}${lineContent}${' '.repeat(padding)}\x1b[0m${themeColor}\u2551\x1b[0m`;

    // Description line
    const descContent = `    ${game.description}`;
    const descPadding = Math.max(0, contentWidth - descContent.length);
    const descColor = isSelected ? (lightTheme ? '\x1b[2;7;97m' : '\x1b[2;7m') : '\x1b[2m';

    output += `\x1b[${y + 1};${boxX}H${themeColor}\u2551\x1b[0m${descColor}${descContent}${' '.repeat(descPadding)}\x1b[0m${themeColor}\u2551\x1b[0m`;

    return output;
  }

  // Start menu
  setTimeout(() => {
    if (!running) return;

    // Verify terminal is still valid before proceeding
    if (!isTerminalValid(terminal)) {
      console.warn('[GamesMenu] Terminal became invalid before menu could start');
      running = false;
      return;
    }

    let keyListener: ReturnType<typeof terminal.onKey> | null = null;

    try {
      // Enter alternate buffer
      enterAlternateBuffer(terminal, 'games-menu');

      render();

      // Redraw on terminal resize
      const resizeListener = terminal.onResize(() => {
        if (running) render();
      });

      keyListener = terminal.onKey(({ domEvent }) => {
        if (!running) {
          keyListener?.dispose();
          return;
        }

        try {
          domEvent.preventDefault();
          domEvent.stopPropagation();

          const key = domEvent.key;
          const keyLower = key.toLowerCase();
          const cols = terminal.cols;
          const boxWidth = 38;
          const columnGap = 2;
          const twoColumnWidth = boxWidth * 2 + columnGap;
          const useTwoColumns = cols >= twoColumnWidth + 8;

          // Quit
          if (key === 'Escape' || keyLower === 'q') {
            keyListener?.dispose();
            controller.stop();
            exitAlternateBuffer(terminal, 'games-menu-quit');
            if (onQuit) {
              onQuit();
            }
            return;
          }

          // Navigate
          if (key === 'ArrowUp') {
            if (useTwoColumns) {
              selectedIndex = Math.max(0, selectedIndex - 2);
            } else {
              selectedIndex = (selectedIndex - 1 + games.length) % games.length;
            }
            render();
            return;
          }
          if (key === 'ArrowDown') {
            if (useTwoColumns) {
              selectedIndex = Math.min(games.length - 1, selectedIndex + 2);
            } else {
              selectedIndex = (selectedIndex + 1) % games.length;
            }
            render();
            return;
          }
          if (key === 'ArrowLeft' && useTwoColumns) {
            if (selectedIndex % 2 === 1) {
              selectedIndex--;
            }
            render();
            return;
          }
          if (key === 'ArrowRight' && useTwoColumns) {
            if (selectedIndex % 2 === 0 && selectedIndex + 1 < games.length) {
              selectedIndex++;
            }
            render();
            return;
          }

          // Helper to launch game with transition
          const launchGame = async (game: typeof games[number]) => {
            keyListener?.dispose();
            running = false;
            // Exit alternate buffer BEFORE transition so menu stops drawing
            exitAlternateBuffer(terminal, 'games-menu-launch');

            try {
              await playSelectTransition(terminal, game.name);
              if (onGameSelect) {
                onGameSelect(game.id);
              }
            } catch (err) {
              console.error('[GamesMenu] Failed to launch game:', err);
              // Ensure terminal is in usable state on error
              forceExitAlternateBuffer(terminal, 'games-menu-launch-error');
              terminal.write(`\x1b[91mError launching game: ${err}\x1b[0m\r\n`);
            }
          };

          // Select
          if (key === 'Enter') {
            launchGame(games[selectedIndex]).catch(err => {
              console.error('[GamesMenu] Unhandled launch error:', err);
            });
            return;
          }

          // Quick select by number (1-9)
          const numKey = parseInt(key);
          if (numKey >= 1 && numKey <= games.length && numKey <= 9) {
            launchGame(games[numKey - 1]).catch(err => {
              console.error('[GamesMenu] Unhandled launch error:', err);
            });
            return;
          }
        } catch (err) {
          console.error('[GamesMenu] Key handler error:', err);
          controller.stop();
        }
      });

      const originalStop = controller.stop;
      controller.stop = () => {
        keyListener?.dispose();
        resizeListener.dispose();
        exitAlternateBuffer(terminal, 'games-menu-stop');
        originalStop();
      };
    } catch (err) {
      console.error('[GamesMenu] Failed to initialize menu:', err);
      forceExitAlternateBuffer(terminal, 'games-menu-init-error');
      running = false;
    }
  }, 50);

  return controller;
}
