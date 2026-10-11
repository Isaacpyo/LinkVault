/**
 * Tracks requests that are taking long enough to suggest the API is cold-starting
 * (Render's free instances sleep after ~15 minutes idle). Components subscribe
 * through `useWakeState` and show a friendly banner instead of a dead spinner.
 */
export interface WakeState {
  waking: boolean;
  /** Epoch ms when the current slow period started. */
  since: number | null;
}

export const WAKE_THRESHOLD_MS = 2_500;

type Listener = () => void;

export class WakeTracker {
  private slow = 0;
  private state: WakeState = { waking: false, since: null };
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  /** Call when a request crosses the slow threshold (or is retrying). Returns a release function. */
  begin(): () => void {
    this.slow++;
    if (!this.state.waking) this.set({ waking: true, since: Date.now() });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.slow = Math.max(0, this.slow - 1);
      if (this.slow === 0) this.set({ waking: false, since: null });
    };
  }

  private set(state: WakeState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

export const wakeTracker = new WakeTracker();
