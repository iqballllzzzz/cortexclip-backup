"""Generate a self-contained demo video with real speech narration so the
karaoke subtitle pipeline can be demonstrated end-to-end with rich text.

Produces: /root/cortexclip/backend/output/demo_speech.mp4 (9:16, voiceover)
and a matching demo_speech.wav.
"""
import subprocess, os

OUT = "/root/cortexclip/backend/output"
os.makedirs(OUT, exist_ok=True)

# Narration text (English — clear, multi-sentence for a good clip selection).
NARRATION = (
    "Welcome to CortexClip, the AI tool that turns one long video "
    "into dozens of viral short clips. Here is how it works. "
    "First, we transcribe your video with word level timestamps. "
    "Then artificial intelligence finds the most engaging moments. "
    "Finally, we render vertical clips with beautiful karaoke subtitles. "
    "You can post these clips to TikTok, Instagram Reels, and YouTube Shorts "
    "in just one click. Start creating today. Your audience is waiting."
)

# 1) Generate speech WAV at 48k
speech = os.path.join(OUT, "demo_speech.wav")
subprocess.run([
    "espeak-ng", "-w", speech, "-s", "155", "-v", "en-us",
    NARRATION,
], check=True)

# probe its duration
dur = float(subprocess.run(
    ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",speech],
    capture_output=True, text=True, check=True).stdout.strip())
print(f"speech duration: {dur:.1f}s")

# 2) Build a vertical 9:16 visual: an animated gradient + a fake "speaker
#    head" that pans left/right a little so face-tracking has something to do.
vid_src = os.path.join(OUT, "demo_visual.nut")  # rawvideo source via lavfi is easier inline
# Use lavfi: color background + moving box, then concat with speech audio.
# Simpler: testsrc2 gives a colorful moving pattern at 1080x1920.
visual = os.path.join(OUT, "demo_visual.mp4")
subprocess.run([
    "ffmpeg","-y","-v","error",
    "-f","lavfi","-i",f"testsrc2=size=1080x1920:rate=30:duration={dur:.2f}",
    "-f","lavfi","-i","sine=frequency=220:duration=0.1",  # silence placeholder? no
    "-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p",
    visual,
], check=True)

# 3) Mux: video (loop, trimmed to speech length) + narration audio
final = os.path.join(OUT, "demo_speech.mp4")
subprocess.run([
    "ffmpeg","-y","-v","error",
    "-i",visual,"-i",speech,
    "-map","0:v:0","-map","1:a:0",
    "-c:v","copy","-c:a","aac","-b:a","128k","-shortest",
    "-movflags","+faststart", final,
], check=True)

size = os.path.getsize(final)
rdur = float(subprocess.run(
    ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",final],
    capture_output=True, text=True, check=True).stdout.strip())
print(f"FINAL: {final}  size={size/1024/1024:.2f}MB  duration={rdur:.1f}s")
print("VISUAL_SEPARATE:", visual)
