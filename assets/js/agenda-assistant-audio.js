(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BezAssistantAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TARGET_SAMPLE_RATE = 16000;
  const MIN_DURATION_SEC = 0.35;
  const MIN_PEAK_AMPLITUDE = 1e-4;

  function concatFloat32(chunks) {
    if (chunks instanceof Float32Array) return chunks;
    if (!Array.isArray(chunks) || !chunks.length) return new Float32Array(0);
    let total = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i]) total += chunks[i].length;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      const part = chunks[i];
      if (!part || !part.length) continue;
      merged.set(part, offset);
      offset += part.length;
    }
    return merged;
  }

  function resampleTo16k(samples, inputSampleRate) {
    if (inputSampleRate === TARGET_SAMPLE_RATE) return samples;
    const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
    const outLength = Math.floor(samples.length / ratio);
    const out = new Float32Array(outLength);

    if (ratio > 1) {
      for (let i = 0; i < outLength; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        let count = 0;
        for (let j = start; j < end; j++) {
          sum += samples[j];
          count++;
        }
        out[i] = count > 0 ? sum / count : 0;
      }
      return out;
    }

    // Upsampling linear caso algum dispositivo entregue menos de 16 kHz.
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = samples[idx] || 0;
      const s1 = samples[Math.min(idx + 1, samples.length - 1)] || 0;
      out[i] = s0 + (s1 - s0) * frac;
    }
    return out;
  }

  function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  /**
   * Converte amostras Float32 em WAV 16-bit PCM mono a 16 kHz.
   */
  function encodeWav16kMono(samples, inputSampleRate) {
    if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
      throw new Error("Taxa de amostragem inválida.");
    }
    const raw = concatFloat32(samples);
    const mono16k = resampleTo16k(raw, inputSampleRate);
    const sampleCount = mono16k.length;
    const durationSec = sampleCount / TARGET_SAMPLE_RATE;

    if (durationSec < MIN_DURATION_SEC || sampleCount < Math.round(TARGET_SAMPLE_RATE * MIN_DURATION_SEC)) {
      throw new Error("Áudio muito curto ou sem som.");
    }

    let peak = 0;
    for (let i = 0; i < sampleCount; i++) {
      const abs = Math.abs(mono16k[i]);
      if (abs > peak) peak = abs;
    }
    if (peak < MIN_PEAK_AMPLITUDE) {
      throw new Error("Áudio muito curto ou sem som.");
    }

    const dataByteLength = sampleCount * 2;
    const buffer = new ArrayBuffer(44 + dataByteLength);
    const view = new DataView(buffer);

    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataByteLength, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // AudioFormat = PCM
    view.setUint16(22, 1, true); // NumChannels = 1 (mono)
    view.setUint32(24, TARGET_SAMPLE_RATE, true);
    view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // ByteRate = 32000
    view.setUint16(32, 2, true); // BlockAlign = 2
    view.setUint16(34, 16, true); // BitsPerSample = 16
    writeAscii(view, 36, "data");
    view.setUint32(40, dataByteLength, true);

    let offset = 44;
    for (let i = 0; i < sampleCount; i++) {
      const clamped = Math.max(-1, Math.min(1, mono16k[i]));
      const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return { buffer, durationSec, sampleCount };
  }

  function isSupported() {
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && AudioCtx);
  }

  function pickMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function createRecorder({ maxSeconds = 60, onTick, onMaxReached } = {}) {
    let audioCtx = null;
    let stream = null;
    let source = null;
    let processor = null;
    let silenceGain = null;
    let mediaRecorder = null;
    let mediaChunks = [];
    let pcmChunks = [];
    let sampleRate = 48000;
    let tickTimer = 0;
    let startedAt = 0;
    let maxTriggered = false;
    let cancelled = false;
    let stopped = false;

    function releaseResources() {
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
      if (processor) {
        processor.onaudioprocess = null;
        try { processor.disconnect(); } catch {}
        processor = null;
      }
      if (source) {
        try { source.disconnect(); } catch {}
        source = null;
      }
      if (silenceGain) {
        try { silenceGain.disconnect(); } catch {}
        silenceGain = null;
      }
      if (stream) {
        try { stream.getTracks().forEach(track => track.stop()); } catch {}
        stream = null;
      }
    }

    async function closeAudioContext() {
      if (!audioCtx) return;
      const ctx = audioCtx;
      audioCtx = null;
      if (ctx.state !== "closed") {
        try { await ctx.close(); } catch {}
      }
    }

    async function start() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        throw new Error("Gravação de áudio indisponível neste navegador ou conexão.");
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("Gravação de áudio indisponível neste navegador ou conexão.");
      }

      cancelled = false;
      stopped = false;
      maxTriggered = false;
      pcmChunks = [];
      mediaChunks = [];

      // Cria e retoma AudioContext dentro do gesto do usuário (exigência do Safari no iPhone).
      audioCtx = new AudioCtx();
      try {
        if (audioCtx.state === "suspended") void audioCtx.resume().catch(() => {});
      } catch {}

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (err) {
        await closeAudioContext();
        throw err;
      }

      if (cancelled) {
        releaseResources();
        await closeAudioContext();
        return;
      }

      if (audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }
      sampleRate = audioCtx.sampleRate || 48000;

      source = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      silenceGain = audioCtx.createGain();
      silenceGain.gain.value = 0;
      processor.onaudioprocess = event => {
        if (cancelled || stopped) return;
        const input = event.inputBuffer.getChannelData(0);
        if (input && input.length) pcmChunks.push(new Float32Array(input));
      };
      source.connect(processor);
      processor.connect(silenceGain);
      silenceGain.connect(audioCtx.destination);

      // Rede de segurança caso o navegador pause ScriptProcessor durante a captura.
      if (typeof MediaRecorder !== "undefined") {
        try {
          const mimeType = pickMimeType();
          mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) mediaChunks.push(event.data);
          };
          mediaRecorder.start();
        } catch {
          mediaRecorder = null;
        }
      }

      startedAt = Date.now();
      if (typeof onTick === "function") onTick(0);
      tickTimer = setInterval(() => {
        if (cancelled || stopped) return;
        const elapsed = (Date.now() - startedAt) / 1000;
        if (typeof onTick === "function") onTick(elapsed);
        if (!maxTriggered && elapsed >= maxSeconds) {
          maxTriggered = true;
          if (typeof onMaxReached === "function") onMaxReached();
        }
      }, 250);
    }

    async function stopMediaRecorder() {
      if (!mediaRecorder || mediaRecorder.state === "inactive") return;
      const recorder = mediaRecorder;
      await new Promise(resolve => {
        const done = () => resolve();
        const timeout = setTimeout(done, 800);
        recorder.addEventListener("stop", () => { clearTimeout(timeout); done(); }, { once: true });
        try { recorder.stop(); } catch { clearTimeout(timeout); done(); }
      });
    }

    async function stop() {
      if (cancelled || stopped) throw new Error("Gravação encerrada.");
      stopped = true;
      await stopMediaRecorder();
      releaseResources();

      let samples = concatFloat32(pcmChunks);
      let rate = sampleRate;
      pcmChunks = [];

      const minSamples = Math.round(rate * MIN_DURATION_SEC);
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        if (abs > peak) peak = abs;
      }

      if ((samples.length < minSamples || peak < MIN_PEAK_AMPLITUDE) && mediaChunks.length && audioCtx) {
        try {
          const mimeType = mediaRecorder?.mimeType || "audio/mp4";
          const fallbackBlob = new Blob(mediaChunks, { type: mimeType });
          const arrayBuffer = await fallbackBlob.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(arrayBuffer);
          if (decoded && decoded.numberOfChannels > 0) {
            samples = decoded.getChannelData(0);
            rate = decoded.sampleRate || rate;
          }
        } catch {}
      }
      mediaChunks = [];
      mediaRecorder = null;
      await closeAudioContext();

      const { buffer, durationSec } = encodeWav16kMono(samples, rate);
      return {
        blob: new Blob([buffer], { type: "audio/wav" }),
        durationSec
      };
    }

    function cancel() {
      if (cancelled) return;
      cancelled = true;
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try { mediaRecorder.stop(); } catch {}
      }
      mediaRecorder = null;
      mediaChunks = [];
      pcmChunks = [];
      releaseResources();
      void closeAudioContext();
    }

    return { start, stop, cancel };
  }

  return {
    TARGET_SAMPLE_RATE,
    MIN_DURATION_SEC,
    concatFloat32,
    encodeWav16kMono,
    isSupported,
    createRecorder
  };
});
