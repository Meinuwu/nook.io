import { useEffect, useRef, useState } from "react";
import type { PresenceStatus } from "../lib/avatarTypes";
import { playTimerCompleteChime } from "../lib/sfx";

const WORK_OPTIONS = [15, 25, 30, 45, 50, 60];
const BREAK_OPTIONS = [5, 10, 15, 20];
const WORK_MIN = 1;
const WORK_MAX = 180;
const BREAK_MIN = 1;
const BREAK_MAX = 60;

type Phase = "idle" | "focus" | "break" | "paused";
export type TimerPhase = "idle" | "work" | "break" | "paused" | "stopped";

interface FocusTimerProps {
  studyingCount: number;
  onStatusChange: (status: PresenceStatus, timerEndsAt: number | null) => void;
  /** Commit focus time accrued so far. `finalize` ends the current run. */
  onFocusProgress: (finalize: boolean) => void;
  onPhaseChange?: (phase: TimerPhase) => void;
  /** Fired when a focus session starts — teleport avatar to last seat. */
  onFocusStart?: () => void;
}

function toTimerPhase(
  phase: Phase,
  everFocused: boolean
): TimerPhase {
  if (phase === "focus") return "work";
  if (phase === "break") return "break";
  if (phase === "paused") return "paused";
  // idle — wander only after a session has started (then ended)
  return everFocused ? "stopped" : "idle";
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export default function FocusTimer({
  studyingCount,
  onStatusChange,
  onFocusProgress,
  onPhaseChange,
  onFocusStart,
}: FocusTimerProps) {
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [workCustom, setWorkCustom] = useState(false);
  const [breakCustom, setBreakCustom] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pausedFrom, setPausedFrom] = useState<"focus" | "break" | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(workMin * 60 * 1000);
  const [sessionDurationMs, setSessionDurationMs] = useState(workMin * 60 * 1000);
  const [everFocused, setEverFocused] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const workMinRef = useRef(workMin);
  const breakMinRef = useRef(breakMin);
  const pausedFromRef = useRef(pausedFrom);
  const prevWorkMinRef = useRef(workMin);
  const prevBreakMinRef = useRef(breakMin);
  phaseRef.current = phase;
  workMinRef.current = workMin;
  breakMinRef.current = breakMin;
  pausedFromRef.current = pausedFrom;

  useEffect(() => {
    onPhaseChange?.(toTimerPhase(phase, everFocused));
  }, [phase, everFocused, onPhaseChange]);

  // Sync remaining time to the preset only when the duration setting actually
  // changes (editing minutes while idle/paused). Must NOT fire on the pause
  // transition itself, or it would wipe the frozen remaining time/progress.
  useEffect(() => {
    const changed = prevWorkMinRef.current !== workMin;
    prevWorkMinRef.current = workMin;
    if (!changed) return;
    if (phase === "idle" || (phase === "paused" && pausedFrom === "focus")) {
      setRemaining(workMin * 60 * 1000);
      setSessionDurationMs(workMin * 60 * 1000);
    }
  }, [workMin, phase, pausedFrom]);

  useEffect(() => {
    const changed = prevBreakMinRef.current !== breakMin;
    prevBreakMinRef.current = breakMin;
    if (!changed) return;
    if (phase === "paused" && pausedFrom === "break") {
      setRemaining(breakMin * 60 * 1000);
      setSessionDurationMs(breakMin * 60 * 1000);
    }
  }, [breakMin, phase, pausedFrom]);

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = endsAt - Date.now();
      setRemaining(left);
      if (left <= 0) handlePhaseEnd();
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  // While focusing, flush accrued whole minutes to the store on a short cadence
  // so both the focus board and the user's stats reflect real elapsed time as
  // it accrues, and progress survives a stop/leave between minute boundaries.
  useEffect(() => {
    if (phase !== "focus") return;
    const id = setInterval(() => onFocusProgress(false), 15000);
    return () => clearInterval(id);
  }, [phase, onFocusProgress]);

  function startFocus() {
    const mins = workMinRef.current;
    const durationMs = mins * 60 * 1000;
    const end = Date.now() + durationMs;
    setEverFocused(true);
    setPhase("focus");
    setPausedFrom(null);
    setEndsAt(end);
    setRemaining(durationMs);
    setSessionDurationMs(durationMs);
    onFocusStart?.();
    onStatusChange("studying", end);
  }

  function startBreak() {
    const mins = breakMinRef.current;
    const durationMs = mins * 60 * 1000;
    const end = Date.now() + durationMs;
    setPhase("break");
    setPausedFrom(null);
    setEndsAt(end);
    setRemaining(durationMs);
    setSessionDurationMs(durationMs);
    onStatusChange("break", end);
  }

  function pause() {
    if (endsAt !== null) {
      setRemaining(Math.max(0, endsAt - Date.now()));
    }
    if (phase === "focus") onFocusProgress(false);
    setPausedFrom(phase === "focus" ? "focus" : "break");
    setPhase("paused");
    setEndsAt(null);
    onStatusChange("idle", null);
  }

  function resume() {
    const from = pausedFromRef.current;
    if (!from) return;
    const end = Date.now() + remaining;
    setPhase(from);
    setPausedFrom(null);
    setEndsAt(end);
    onStatusChange(from === "focus" ? "studying" : "break", end);
  }

  function endSession() {
    onFocusProgress(true);
    setPhase("idle");
    setPausedFrom(null);
    setEndsAt(null);
    const resetMs = workMinRef.current * 60 * 1000;
    setRemaining(resetMs);
    setSessionDurationMs(resetMs);
    onStatusChange("idle", null);
  }

  function handlePhaseEnd() {
    if (phaseRef.current === "focus") {
      onFocusProgress(true);
      void playTimerCompleteChime();
      startBreak();
    } else {
      endSession();
    }
  }

  function handleWorkSelect(value: string) {
    if (value === "custom") {
      setWorkCustom(true);
      return;
    }
    setWorkCustom(false);
    setWorkMin(Number(value));
  }

  function handleBreakSelect(value: string) {
    if (value === "custom") {
      setBreakCustom(true);
      return;
    }
    setBreakCustom(false);
    setBreakMin(Number(value));
  }

  const activePhase = phase === "paused" ? pausedFrom : phase;
  const progress =
    phase === "idle"
      ? 0
      : sessionDurationMs > 0
        ? 1 - Math.max(0, remaining) / sessionDurationMs
        : 0;
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const ringColor = activePhase === "break" ? "#C4A882" : "#F4A98A";
  const canEdit = phase === "idle" || phase === "paused";

  const phaseLabel =
    phase === "break" || (phase === "paused" && pausedFrom === "break")
      ? phase === "paused"
        ? "Break · Paused"
        : "Break"
      : phase === "focus" || (phase === "paused" && pausedFrom === "focus")
        ? phase === "paused"
          ? "Focus · Paused"
          : "Focus"
        : "Pomodoro";

  const displayTime =
    phase === "idle" ? `${String(workMin).padStart(2, "0")}:00` : fmt(remaining);

  const selectClass = "input-cozy !w-auto !py-1.5 !px-3 text-sm";

  return (
    <div className="panel flex items-center gap-4 px-5 py-3">
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <svg width="120" height="120" className="-rotate-90" shapeRendering="geometricPrecision">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#EADBC6" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.3s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-brown">{displayTime}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-brown/60">
            {phaseLabel}
          </span>
        </div>
      </div>

      <div className="flex min-w-[140px] flex-col gap-2">
        {canEdit && (
          <div className="flex gap-2 text-xs">
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 font-bold text-brown/70">
              Work
              <select
                value={workCustom ? "custom" : workMin}
                onChange={(e) => handleWorkSelect(e.target.value)}
                className={selectClass}
              >
                {WORK_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {workCustom && (
                <input
                  type="number"
                  min={WORK_MIN}
                  max={WORK_MAX}
                  value={workMin}
                  onChange={(e) =>
                    setWorkMin(clamp(Number(e.target.value) || WORK_MIN, WORK_MIN, WORK_MAX))
                  }
                  className="input-cozy !py-1.5 text-sm"
                  aria-label="Custom work minutes"
                />
              )}
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 font-bold text-brown/70">
              Break
              <select
                value={breakCustom ? "custom" : breakMin}
                onChange={(e) => handleBreakSelect(e.target.value)}
                className={selectClass}
              >
                {BREAK_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {breakCustom && (
                <input
                  type="number"
                  min={BREAK_MIN}
                  max={BREAK_MAX}
                  value={breakMin}
                  onChange={(e) =>
                    setBreakMin(clamp(Number(e.target.value) || BREAK_MIN, BREAK_MIN, BREAK_MAX))
                  }
                  className="input-cozy !py-1.5 text-sm"
                  aria-label="Custom break minutes"
                />
              )}
            </label>
          </div>
        )}

        <p className="text-xs font-semibold text-brown/60">
          {studyingCount > 0
            ? `${studyingCount} focusing now`
            : "Start whenever you're ready"}
        </p>

        {phase === "idle" && (
          <button onClick={startFocus} className="btn-primary !py-2 text-sm">
            Start focus
          </button>
        )}
        {phase === "focus" && (
          <div className="flex flex-col gap-1">
            <button onClick={pause} className="btn-ghost !py-2 text-sm">
              Pause
            </button>
            <button onClick={endSession} className="btn-ghost !py-1 text-xs">
              End session
            </button>
          </div>
        )}
        {phase === "paused" && (
          <div className="flex flex-col gap-1">
            <button onClick={resume} className="btn-primary !py-2 text-sm">
              Resume
            </button>
            <button onClick={endSession} className="btn-ghost !py-1 text-xs">
              {pausedFrom === "break" ? "End break" : "End session"}
            </button>
          </div>
        )}
        {phase === "break" && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold text-brown">Break time ☕</p>
            <button onClick={startFocus} className="btn-primary !py-2 text-sm">
              Skip to focus
            </button>
            <button onClick={pause} className="btn-ghost !py-2 text-sm">
              Pause
            </button>
            <button onClick={endSession} className="btn-ghost !py-1 text-xs">
              End break
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
