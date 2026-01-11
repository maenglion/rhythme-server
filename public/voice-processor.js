// /js/voice-processor.js
export class VoiceProcessor {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this._raf = null;
    this._stopped = false;

    this.noiseRms = null; // baseline RMS
  }

  async init() {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.ctx.createMediaStreamSource(this.stream);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
  }

  async calibrateSilence(seconds = 2) {
    await this.init();
    const rmsList = [];
    const start = performance.now();
    const buf = new Float32Array(this.analyser.fftSize);

    while (performance.now() - start < seconds * 1000) {
      this.analyser.getFloatTimeDomainData(buf);
      rmsList.push(rms(buf));
      await sleep(50);
    }

    // median이 안정적
    this.noiseRms = median(rmsList);
    const noiseDb = toDb(this.noiseRms);
    return { noise_floor_db: noiseDb };
  }

  async startStage({ durationSec = 40, onTick } = {}) {
    await this.init();
    this._stopped = false;

    const buf = new Float32Array(this.analyser.fftSize);

    // 누적 통계
    let frames = 0;
    let voicedFrames = 0;
    let pauseFrames = 0;

    let rmsSum = 0;
    let peakClipCount = 0;
    let peakCount = 0;

    const pitchList = [];

    const start = performance.now();
    const endAt = start + durationSec * 1000;

    return new Promise((resolve) => {
      const loop = () => {
        if (this._stopped) return finalize("stopped");

        const now = performance.now();
        const leftMs = Math.max(0, endAt - now);
        if (onTick) onTick({ leftMs, elapsedMs: now - start });

        this.analyser.getFloatTimeDomainData(buf);

        const r = rms(buf);
        const p = peakAbs(buf);

        frames += 1;
        rmsSum += r;

        peakCount += 1;
        if (p >= 0.99) peakClipCount += 1;

        // VAD(아주 단순): noiseRms 대비 threshold
        const noise = this.noiseRms ?? 1e-6;
        const isVoiced = r > noise * 2.5; // MVP용
        if (isVoiced) voicedFrames += 1;
        else pauseFrames += 1;

        // pitch: voiced일 때만 추정
        if (isVoiced) {
          const f0 = autoCorrelPitch(buf, this.ctx.sampleRate);
          if (f0) pitchList.push(f0);
        }

        if (now >= endAt) return finalize("completed");
        this._raf = requestAnimationFrame(loop);
      };
const finalize = (status) => {
  if (this._raf) cancelAnimationFrame(this._raf);

  const endNow = performance.now();                 // ✅ 추가
  const recorded_ms = endNow - start;               // ✅ now -> endNow
        const denom = Math.max(1, frames);
const speech_rate = (voicedFrames / denom) * 10;
        const noise = this.noiseRms ?? 1e-6;
        const signalRms = rmsSum / Math.max(1, frames);
        const snr = 20 * Math.log10((signalRms + 1e-9) / (noise + 1e-9));

        const pause_ratio = pauseFrames / Math.max(1, frames);
        const clipping_ratio = peakClipCount / Math.max(1, peakCount);

        // voiced가 아닌데 r(에너지)이 어느 정도 있는 경우를 감지
const bg_voice_ratio = pauseFrames / Math.max(1, frames); 
// 사실상 pause_ratio와 비슷하지만, '침묵 구간 중 환경 소음'의 의미로 활용 가능합니다.

        const pitch_mean = mean(pitchList);
        const pitch_sd = std(pitchList);

        resolve({
        status,
        noise_floor_db: toDb(noise),
    snr_est_db: snr,
    pitch_mean: pitch_mean ?? null,
    pitch_sd: pitch_sd ?? null,
    pause_ratio,
    clipping_ratio,
    bg_voice_ratio: (pauseFrames / frames) * 0.5, // 환경 소음 개입 가능성 지수
    speech_rate: speech_rate, // 추가
    bg_voice_ratio,   // 추가
    recorded_ms: Math.floor(recorded_ms) // 추가
});
      };

      loop();
    });
  }

  stop() {
    this._stopped = true;
  }
}

/* --- helpers --- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function peakAbs(buf) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > m) m = a;
  }
  return m;
}

function toDb(r) {
  return 20 * Math.log10((r ?? 1e-9) + 1e-9);
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  let v = 0;
  for (const x of arr) v += (x - m) ** 2;
  return Math.sqrt(v / (arr.length - 1));
}

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// 아주 단순한 autocorrelation 기반 pitch (MVP)
function autoCorrelPitch(buf, sampleRate) {
  // 너무 조용하면 skip
  const r = rms(buf);
  if (r < 0.01) return null;

  // 탐색 범위(성인/아이 폭 넓게)
  const minF = 70;
  const maxF = 450;
  const minLag = Math.floor(sampleRate / maxF);
  const maxLag = Math.floor(sampleRate / minF);

  let bestLag = -1;
  let best = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < buf.length - lag; i++) sum += buf[i] * buf[i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return null;
  const f0 = sampleRate / bestLag;
  return Number.isFinite(f0) ? f0 : null;
}
