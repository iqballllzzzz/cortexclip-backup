"""End-to-end CortexClip pipeline test (direct module calls, no HTTP).

Flow: demo video -> extract audio -> transcribe chunks (Hydra STT) ->
assemble transcript -> detect clips (2-pass) -> render MP4 with ASS.
"""
import asyncio
import os
import subprocess
import tempfile

from dotenv import load_dotenv
load_dotenv()

from app.hydra import gateway
from app.transcribe import transcribe_wav_chunk, transcript_with_words
from app.clip_selection import detect_clips
from app.subtitles import build_ass, build_srt, DEFAULT_STYLE
from app import render as render_mod

DEMO = "/root/cortexclip/backend/output/demo_speech.mp4"
OUTDIR = "/root/cortexclip/backend/output"
os.makedirs(OUTDIR, exist_ok=True)

CHUNK_SECONDS = 30


def extract_audio_chunks(path):
    """Extract full audio as 16k mono wav, return list of (offset, bytes)."""
    # first get duration
    dur = render_mod.probe_duration(path)
    chunks = []
    start = 0.0
    while start < dur:
        end = min(start + CHUNK_SECONDS, dur)
        fd, wav = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}",
            "-t", f"{end-start:.3f}", "-i", path,
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav,
        ], check=True, capture_output=True)
        chunks.append((start, open(wav, "rb").read()))
        os.unlink(wav)
        start = end
    return dur, chunks


async def main():
    print(f"=== 0. Video: {DEMO} ===")
    dur = render_mod.probe_duration(DEMO)
    print(f"    duration: {dur:.1f}s")

    print("\n=== 1. Transcribe chunks ===")
    total, chunks = extract_audio_chunks(DEMO)
    all_segments = []
    for i, (offset, wav) in enumerate(chunks):
        print(f"  chunk {i+1}/{len(chunks)} off={offset:.0f}s len={len(wav)}")
        segs = await transcribe_wav_chunk(wav, offset, len(wav) / 32000.0)
        print(f"    -> {len(segs)} segments")
        for s in segs[:3]:
            print(f"       [{s['start']:.1f}-{s['end']:.1f}] {s['text'][:70]}")
        all_segments.extend(segs)
        if not segs:
            print("  !! no segments; STT returned nothing for this chunk")
    if not all_segments:
        print("FATAL: no transcription at all. STT failed everywhere.")
        return
    print(f"  total segments: {len(all_segments)}")

    print("\n=== 2. Assemble transcript ===")
    all_segments.sort(key=lambda s: s["start"])
    transcript = {
        "language": "auto",
        "duration": round(max(s["end"] for s in all_segments), 2),
        "segments": transcript_with_words(all_segments),
    }
    print(f"  duration={transcript['duration']}s, segments={len(transcript['segments'])}")
    sample = " ".join(s["text"] for s in all_segments[:12])
    print(f"  preview: {sample[:200]}")

    print("\n=== 3. Detect clips (2-pass) ===")
    clips = await detect_clips(transcript, target_count=5)
    print(f"  -> {len(clips)} clips detected")
    for c in clips:
        print(f"     [{c['start']:.1f}-{c['end']:.1f}] v={c['score']} | {c['title'][:50]} | hook={c['hook'][:30]}")
    if not clips:
        print("FATAL: no clips detected")
        return

    print("\n=== 4. Render MP4 (karaoke ASS) ===")
    style = dict(DEFAULT_STYLE)
    style.update({"effect": "pop", "fontName": "Anton", "accent": "#FFD400",
                  "fontSize": 30, "uppercase": True})
    best = clips[0]
    word_ctx = []
    for s in transcript["segments"]:
        for w in s["words"]:
            if w["end"] <= best["start"] or w["start"] >= best["end"]:
                continue
            word_ctx.append({
                "word": w["word"],
                "start": round(max(0, w["start"] - best["start"]), 2),
                "end": round(max(0.2, w["end"] - best["start"]), 2),
            })
    ass = build_ass(word_ctx, style)
    srt = build_srt(word_ctx)
    out = os.path.join(OUTDIR, "e2e_clip0.mp4")
    with tempfile.NamedTemporaryFile("w", suffix=".ass", delete=False) as f:
        f.write(ass)
        ass_path = f.name
    try:
        traj = render_mod.analyze_face_track(DEMO, best["start"], best["end"])
        print(f"  face-tracking trajectory points: {len(traj)}")
        render_mod.render_clip(
            DEMO, best["start"], best["end"], ass_path, out,
            resolution="720x1280", face_tracking=bool(traj), camera_trajectory=traj,
        )
    finally:
        os.unlink(ass_path)
    size = os.path.getsize(out)
    rdur = render_mod.probe_duration(out)
    print(f"  -> MP4 OK: {out}")
    print(f"  -> size={size/1024/1024:.2f}MB duration={rdur:.1f}s")
    # save srt for reference
    with open(os.path.join(OUTDIR, "e2e_clip0.srt"), "w") as f:
        f.write(srt)
    print("\nDONE ✅")


asyncio.run(main())
