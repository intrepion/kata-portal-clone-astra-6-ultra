type SoundEvent =
  | "blue"
  | "orange"
  | "teleport"
  | "pickup"
  | "drop"
  | "door"
  | "complete"
  | "respawn"
  | "error"
  | "click";

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type Voice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

const STORAGE_KEY = "parallax-sound";
const MAX_VOICES = 16;

/** Original, quiet laboratory ambience and synthesized interaction cues. */
export class Soundscape {
  enabled = true;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private ambience: AudioScheduledSourceNode[] = [];
  private ambienceNodes: AudioNode[] = [];
  private disposed = false;

  constructor() {
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      // Storage is optional in private browsing and embedded previews.
    }
  }

  async start(): Promise<void> {
    if (this.disposed || !this.enabled) return;
    // Each gesture must be allowed to call resume: a browser can leave an earlier
    // resume promise pending until a new user interaction occurs.
    await this.initialize();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // The in-memory preference still works when storage is unavailable.
    }

    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(enabled ? 0.36 : 0, now, 0.045);
    }
    if (enabled) void this.start();
  }

  play(event: SoundEvent): void {
    if (!this.enabled || this.disposed) return;
    if (this.context?.state === "running") {
      this.emit(event);
      return;
    }

    // Called from interaction handlers, this also retries a browser-blocked resume.
    void this.start().then(() => {
      if (this.enabled && !this.disposed && this.context?.state === "running") {
        this.emit(event);
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const voice of this.voices) this.stopVoice(voice);
    this.voices.clear();
    for (const source of this.ambience) {
      try {
        source.stop();
      } catch {
        /* The source may have already stopped. */
      }
      source.disconnect();
    }
    for (const node of this.ambienceNodes) node.disconnect();
    this.ambience = [];
    this.ambienceNodes = [];
    this.master?.disconnect();
    if (this.context && this.context.state !== "closed") {
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.master = null;
  }

  private async initialize(): Promise<void> {
    try {
      if (!this.context) {
        const AudioContextClass =
          typeof window === "undefined"
            ? undefined
            : (window.AudioContext ??
              (window as AudioWindow).webkitAudioContext);
        if (!AudioContextClass) return;

        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.context.destination);
        this.createAmbience();
      }

      const context = this.context;
      if (context.state !== "running" && context.state !== "closed")
        await context.resume();
      if (this.disposed || !this.master || context.state !== "running") return;
      this.master.gain.setTargetAtTime(
        this.enabled ? 0.36 : 0,
        context.currentTime,
        0.18,
      );
    } catch {
      // Audio must never prevent play. A later user gesture can retry start().
    }
  }

  private createAmbience(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const droneGain = context.createGain();
    droneGain.gain.value = 0.011;
    droneGain.connect(master);
    this.ambienceNodes.push(droneGain);

    for (const frequency of [73.42, 146.92]) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(droneGain);
      oscillator.start();
      this.ambience.push(oscillator);
    }

    // A long loop with a faded seam produces soft ventilation, without assets.
    const noiseBuffer = context.createBuffer(
      1,
      context.sampleRate * 4,
      context.sampleRate,
    );
    const data = noiseBuffer.getChannelData(0);
    const seamLength = Math.floor(context.sampleRate * 0.08);
    for (let i = 0; i < data.length; i++) {
      const edge = Math.min(
        1,
        i / seamLength,
        (data.length - 1 - i) / seamLength,
      );
      data[i] = (Math.random() * 2 - 1) * edge;
    }
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 720;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1700;
    const airGain = context.createGain();
    airGain.gain.value = 0.013;
    noise.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(airGain);
    airGain.connect(master);
    noise.start();
    this.ambience.push(noise);
    this.ambienceNodes.push(highpass, lowpass, airGain);
  }

  private emit(event: SoundEvent): void {
    switch (event) {
      case "blue":
        this.tone(210, 680, 0.2, 0.18, "sine");
        this.tone(760, 390, 0.14, 0.07, "triangle", 0.02);
        break;
      case "orange":
        this.tone(510, 235, 0.24, 0.18, "sine");
        this.tone(1030, 590, 0.15, 0.06, "triangle", 0.02);
        break;
      case "teleport":
        this.tone(110, 440, 0.38, 0.14, "sine");
        this.tone(660, 165, 0.28, 0.1, "triangle");
        this.tone(440, 440, 0.32, 0.07, "sine", 0.08);
        break;
      case "pickup":
        this.tone(330, 495, 0.12, 0.13, "sine");
        this.tone(660, 660, 0.17, 0.06, "sine", 0.07);
        break;
      case "drop":
        this.tone(220, 95, 0.13, 0.16, "triangle");
        break;
      case "door":
        this.tone(130, 196, 0.48, 0.09, "triangle");
        this.tone(392, 392, 0.28, 0.06, "sine", 0.12);
        break;
      case "complete":
        [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
          this.tone(frequency, frequency, 0.65, 0.1, "sine", index * 0.13);
        });
        break;
      case "respawn":
        this.tone(294, 147, 0.42, 0.12, "sine");
        this.tone(98, 196, 0.48, 0.07, "sine", 0.17);
        break;
      case "error":
        this.tone(120, 110, 0.11, 0.1, "triangle");
        this.tone(120, 110, 0.1, 0.08, "triangle", 0.14);
        break;
      case "click":
        this.tone(880, 690, 0.045, 0.055, "sine");
        break;
    }
  }

  private tone(
    frequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    waveform: OscillatorType,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== "running") return;
    while (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.values().next().value;
      if (oldest) this.stopVoice(oldest);
      else break;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice = { oscillator, gain };
    const start = context.currentTime + delay;
    const end = start + duration;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      volume,
      start + Math.min(0.018, duration * 0.2),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.gain.linearRampToValueAtTime(0, end + 0.012);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    this.voices.add(voice);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private stopVoice(voice: Voice): void {
    try {
      voice.oscillator.stop();
    } catch {
      /* A scheduled source can already be stopped. */
    }
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }
}
