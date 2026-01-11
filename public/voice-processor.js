// ./voice-processor.js

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

  // ✅ stage별 상태(전역 X)
  let lastNow = start;
  let pauseSegMs = 0;
  let pauseMs = 0;
  let longPauseCount = 0;
  let shortPauseCount = 0;

  let restartRmsSpikeCount = 0;
  let rmsBaselineWin = [];
  const BASE_WIN = 40;

  return new Promise((resolve) => {
    const finalize = (status) => {
      if (this._raf) cancelAnimationFrame(this._raf);

      // ✅ 무음 상태로 끝난 경우도 세그먼트 반영
      if (pauseSegMs >= 600) longPauseCount += 1;
      else if (pauseSegMs >= 200) shortPauseCount += 1;

      const endNow = performance.now();
      const recorded_ms = endNow - start;

      const denom = Math.max(1, frames);
      const speech_rate = (voicedFrames / denom) * 10;

      const noise = this.noiseRms ?? 1e-6;
      const signalRms = rmsSum / Math.max(1, frames);
      const snr = 20 * Math.log10((signalRms + 1e-9) / (noise + 1e-9));

      const pause_ratio = pauseMs / Math.max(1, recorded_ms);
      const clipping_ratio = peakClipCount / Math.max(1, peakCount);

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
        speech_rate,
        recorded_ms: Math.floor(recorded_ms),

        long_pause_count_600ms: longPauseCount,
        short_pause_count_200_600ms: shortPauseCount,
        pause_ms: Math.floor(pauseMs),
        restart_rms_spike_count: restartRmsSpikeCount,
      });
    };

    const loop = () => {
      if (this._stopped) return finalize("stopped");

      const now = performance.now();                 // ✅ now 먼저
      const dtMs = Math.max(0, now - lastNow);       // ✅ 그 다음 dt
      lastNow = now;

      const leftMs = Math.max(0, endAt - now);
      if (onTick) onTick({ leftMs, elapsedMs: now - start });

      this.analyser.getFloatTimeDomainData(buf);

      const r = rms(buf);
      const p = peakAbs(buf);

      frames += 1;
      rmsSum += r;

      peakCount += 1;
      if (p >= 0.99) peakClipCount += 1;

      const noise = this.noiseRms ?? 1e-6;
      const isVoiced = r > noise * 2.5;

      if (isVoiced) voicedFrames += 1;
      else pauseFrames += 1;

      // ✅ baseline(유음) 업데이트
      if (isVoiced) {
        rmsBaselineWin.push(r);
        if (rmsBaselineWin.length > BASE_WIN) rmsBaselineWin.shift();
      }

      // ✅ pause segment 누적 + 전환 순간 체크
      if (!isVoiced) {
        pauseSegMs += dtMs;
        pauseMs += dtMs;
      } else {
        // 무음→유음 전환 순간(렉 종료)
        if (pauseSegMs >= 600) {
          longPauseCount += 1;

          // ✅ 재시작 과강조: 전환 직후 현재 r이 baseline보다 큰지
          if (rmsBaselineWin.length >= 10) {
            const base = median(rmsBaselineWin);
            if (base && r > base * 1.8) restartRmsSpikeCount += 1;
          }
        } else if (pauseSegMs >= 200) {
          shortPauseCount += 1;
        }
        pauseSegMs = 0;
      }

      // pitch
      if (isVoiced) {
        const f0 = autoCorrelPitch(buf, this.ctx.sampleRate);
        if (f0) pitchList.push(f0);
      }

      if (now >= endAt) return finalize("completed");
      this._raf = requestAnimationFrame(loop);
    };

    loop();
  });
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
