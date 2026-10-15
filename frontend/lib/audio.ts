// Records with MediaRecorder (webm on Chrome, mp4 on iOS Safari), then decodes and re-encodes to 16 kHz mono WAV
// in the browser. If decoding fails, the raw recording is sent and the backend normalises it with ffmpeg.

export const MAX_RECORD_MS = 29_000; // Sarvam REST STT accepts clips under 30 s.
const TARGET_RATE = 16_000;

export type Recorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  level: () => number;
};

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const rec = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  rec.start(250);
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => undefined);
  };

  return {
    level() {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 4);
    },
    cancel() {
      if (rec.state !== "inactive") rec.stop();
      release();
    },
    stop() {
      return new Promise<Blob>((resolve, reject) => {
        rec.onstop = async () => {
          release();
          const raw = new Blob(chunks, { type: rec.mimeType });
          if (!raw.size) return reject(new Error("empty recording"));
          try {
            resolve(await toWav16kMono(raw));
          } catch {
            // Some browsers cannot decode their own recording; the backend converts it with ffmpeg instead.
            resolve(raw);
          }
        };
        rec.stop();
      });
    },
  };
}

export async function toWav16kMono(blob: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close().catch(() => undefined);
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination); // multi-channel input is downmixed to the mono destination
  src.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (const s of samples) {
    const v = Math.max(-1, Math.min(1, s));
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    o += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

export function b64ToUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
