import { loadPreferences } from "./preferences";

let audioContext: AudioContext | null = null;

function ensureContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

async function resumeContext(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

function shouldPlaySfx(): boolean {
  return loadPreferences().soundEffects;
}

/** Warm, mellow tap for buttons, toggles, and other UI feedback. */
export async function playSoftClick(): Promise<void> {
  if (!shouldPlaySfx()) return;

  const ctx = ensureContext();
  await resumeContext(ctx);

  const now = ctx.currentTime;
  const duration = 0.065;

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(360, now);
  body.frequency.exponentialRampToValueAtTime(220, now + 0.03);

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.value = 780;
  bodyFilter.Q.value = 0.4;

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, now);
  bodyGain.gain.linearRampToValueAtTime(0.045, now + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(ctx.destination);

  const noiseLength = Math.floor(ctx.sampleRate * 0.018);
  const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i++) {
    const fade = 1 - i / noiseLength;
    noiseData[i] = (Math.random() * 2 - 1) * fade * fade;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 950;
  noiseFilter.Q.value = 0.9;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.018, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  body.start(now);
  body.stop(now + duration + 0.01);
  noise.start(now);
  noise.stop(now + 0.02);
}

function playBellPartial(
  ctx: AudioContext,
  startTime: number,
  frequency: number,
  duration: number,
  peakGain: number
): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, startTime);
  filter.frequency.exponentialRampToValueAtTime(600, startTime + duration * 0.7);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

/** Soft bell chime when a focus session completes. */
export async function playTimerCompleteChime(): Promise<void> {
  if (!shouldPlaySfx()) return;

  const ctx = ensureContext();
  await resumeContext(ctx);

  const now = ctx.currentTime;
  const fundamental = 392.0;

  playBellPartial(ctx, now, fundamental, 1.8, 0.055);
  playBellPartial(ctx, now, fundamental * 2.01, 1.4, 0.014);
  playBellPartial(ctx, now + 0.05, fundamental * 3.02, 1.0, 0.006);
}

/** Delegated click handler for cozy UI feedback across the app. */
export function handleUiClickSound(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const interactive = target.closest(
    'button:not([disabled]), [role="switch"]:not([disabled]), .selectable-option, .bottom-nav a'
  );
  if (!interactive) return;

  void playSoftClick();
}
