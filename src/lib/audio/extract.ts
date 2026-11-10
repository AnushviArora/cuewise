const SAMPLE_RATE = 16_000; // plenty for speech, and keeps files small
/** 10 min of 16 kHz mono 16-bit WAV ≈ 19 MB — safely under OpenAI's 25 MB limit. */
export const CHUNK_SECONDS = 600;

export interface AudioChunk {
  blob: Blob;
  /** Where this chunk starts in the video, in seconds. */
  offset: number;
}

function encodeWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Decodes the video's audio track in the browser and returns 16 kHz mono WAV chunks.
 * The video itself never leaves the device — only these small audio chunks are sent.
 * Prototype limit: the whole track is decoded in memory, so very long lectures are heavy.
 */
export async function extractAudioChunks(file: File): Promise<AudioChunk[]> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: SAMPLE_RATE });
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(
      "Couldn’t read the audio from this video. It may have no audio track, or be too large for the browser to decode — try a shorter clip.",
    );
  } finally {
    void ctx.close();
  }

  // Mix down to mono.
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }

  const size = CHUNK_SECONDS * decoded.sampleRate;
  const chunks: AudioChunk[] = [];
  for (let start = 0; start < mono.length; start += size) {
    chunks.push({
      blob: encodeWav(mono.subarray(start, start + size)),
      offset: start / decoded.sampleRate,
    });
  }
  return chunks;
}
