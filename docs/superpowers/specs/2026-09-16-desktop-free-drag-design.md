# Desktop free dragging

## User requirement

Allow AI OS app windows to be dragged past the left, right, and bottom of the desktop. The Dock must not act as a movement boundary. User subsequently clarified that the top boundary must remain: the titlebar stops below the menu bar. User has requested direct execution without further approval prompts.

## Design

- Keep finite x coordinates unbounded and y coordinates constrained only to y >= 0 (the work-area top, below the menu). Retain existing minimum/maximum dimensions, maximized work area, and responsive small-screen layout.
- Keep the menu bar and Dock stacking unchanged. Windows may extend into the Dock region; only the outer desktop clips pixels outside the actual screen.
- Preserve partially offscreen geometry across focus, viewport updates, maximize/restore, and layout persistence.
- Normalize old negative-y saved layouts and restore bounds to y=0 without otherwise changing their horizontal placement.
- Recovery is an explicit launch/Dock action, never a drag-time clamp. When insufficient titlebar is reachable in the desktop work area, center the window without changing its size. A Dock click recovers an inaccessible active window instead of minimizing it.
- Ordinary pointer focus must not recover/reposition a window. New cascaded windows and reopened saved layouts must be reachable.
- Do not change canvas/gallery behavior, provider settings, or window-resize policy.

## Alternatives considered

Retaining a narrow visible strip at the sides or bottom would still impose unwanted drag boundaries. Unbounded side/bottom movement plus explicit recovery avoids stranding windows after display changes; the top remains constrained as explicitly requested.

## Verification

Unit tests cover the top boundary, unbounded sides/bottom, old negative-y layout repair, persistence, recovery, maximization, and responsive restoration. Isolated Chrome tests exercise real pointer dragging at 100% and 150%, stopping immediately below the menu bar and dragging down again, Dock overlap/recovery, release without snapping, and unchanged Dock toggling. Use temporary accounts/database and a local mock, never the user's real configuration or API.
