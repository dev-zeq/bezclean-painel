import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const Audio = require("../assets/js/agenda-assistant-audio.js");

function makeSine(sampleRate, seconds, amplitude = 0.5) {
  const length = Math.round(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  return out;
}

test("concatFloat32 junta partes e encodeWav16kMono gera WAV 16 kHz mono válido", () => {
  const full = makeSine(48000, 1.0, 0.4);
  const partA = full.subarray(0, 20000);
  const partB = full.subarray(20000);
  const merged = Audio.concatFloat32([partA, partB]);
  assert.equal(merged.length, 48000);

  const { buffer, durationSec, sampleCount } = Audio.encodeWav16kMono([partA, partB], 48000);
  assert.equal(sampleCount, 16000);
  assert.equal(durationSec, 1);
  assert.equal(buffer.byteLength, 44 + 16000 * 2);

  const view = new DataView(buffer);
  const ascii = (start, len) => String.fromCharCode(...new Uint8Array(buffer, start, len));
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(view.getUint32(4, true), 36 + 16000 * 2);
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(12, 4), "fmt ");
  assert.equal(view.getUint32(16, true), 16);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(28, true), 32000);
  assert.equal(view.getUint16(32, true), 2);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(ascii(36, 4), "data");
  assert.equal(view.getUint32(40, true), 16000 * 2);
});

test("faz downsampling de 44.1 kHz e limita picos fora de [-1, 1]", () => {
  const signal = new Float32Array(22050);
  for (let i = 0; i < signal.length; i++) {
    signal[i] = i % 2 === 0 ? 2.5 : -2.5;
  }
  const { buffer, sampleCount } = Audio.encodeWav16kMono(signal, 44100);
  assert.equal(sampleCount, 8000);
  const view = new DataView(buffer);
  for (let offset = 44; offset < buffer.byteLength; offset += 2) {
    const sample = view.getInt16(offset, true);
    assert.ok(sample >= -32768 && sample <= 32767);
  }
});

test("rejeita áudio muito curto, mudo ou com taxa inválida", () => {
  assert.throws(() => Audio.encodeWav16kMono(makeSine(48000, 0.2), 48000), /muito curto/);
  assert.throws(() => Audio.encodeWav16kMono(new Float32Array(48000), 48000), /sem som/);
  assert.throws(() => Audio.encodeWav16kMono(makeSine(16000, 1.0), 0), /Taxa de amostragem/);
});
