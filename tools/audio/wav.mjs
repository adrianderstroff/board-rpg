// Minimal WAV (RIFF, PCM 16-bit mono) encoder and parser. No dependencies.

/** Float32 (-1..1) -> WAV file bytes (16-bit PCM, mono). */
export function encodeWav(samples, sr) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // channels
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 32768 : s * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * Parse and validate a WAV file. Walks all chunks, so it also accepts files
 * with extra chunks. Throws on anything malformed.
 * @returns {{ sampleRate, channels, bits, frames, duration, samples: Float32Array }}
 */
export function parseWav(buf) {
  const fail = (msg) => {
    throw new Error(`Invalid WAV: ${msg}`);
  };
  if (buf.length < 12) fail('too short');
  if (buf.toString('ascii', 0, 4) !== 'RIFF') fail('no RIFF');
  if (buf.toString('ascii', 8, 12) !== 'WAVE') fail('no WAVE');
  if (buf.readUInt32LE(4) !== buf.length - 8) fail(`RIFF size ${buf.readUInt32LE(4)} != ${buf.length - 8}`);
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString('ascii', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (o + 8 + size > buf.length) fail(`chunk ${id} overruns file`);
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(o + 8),
        channels: buf.readUInt16LE(o + 10),
        sampleRate: buf.readUInt32LE(o + 12),
        byteRate: buf.readUInt32LE(o + 16),
        blockAlign: buf.readUInt16LE(o + 20),
        bits: buf.readUInt16LE(o + 22),
      };
    } else if (id === 'data') data = { offset: o + 8, size };
    o += 8 + size + (size & 1);
  }
  if (!fmt) fail('missing fmt chunk');
  if (!data) fail('missing data chunk');
  if (fmt.format !== 1) fail(`format ${fmt.format} is not PCM`);
  if (fmt.bits !== 16) fail(`${fmt.bits} bits, expected 16`);
  if (fmt.blockAlign !== fmt.channels * 2) fail('bad block align');
  if (fmt.byteRate !== fmt.sampleRate * fmt.blockAlign) fail('bad byte rate');
  if (data.size % fmt.blockAlign) fail('data size not a multiple of block align');
  const n = data.size / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(data.offset + i * 2) / 32768;
  const frames = n / fmt.channels;
  return { ...fmt, frames, duration: frames / fmt.sampleRate, samples };
}
