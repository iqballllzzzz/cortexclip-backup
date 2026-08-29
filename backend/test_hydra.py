# CortexClip backend test script — end-to-end pipeline check
import asyncio, os, sys
from dotenv import load_dotenv
load_dotenv()

from app.hydra import gateway

async def main():
    print("=== 1. Hydra chat test ===")
    r = await gateway.chat([{"role": "user", "content": "Balas dengan satu kata: SIAP"}], max_tokens=30, temperature=0)
    print("CHAT OK:", r[:80])

    print("\n=== 2. Hydra STT test (synthetic speech-free wav) ===")
    import subprocess, tempfile
    # generate a 3s 440Hz tone (no speech) — whisper should return ~nothing
    fd, path = tempfile.mkstemp(suffix=".wav"); os.close(fd)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                    "-ar", "16000", "-ac", "1", path], check=True)
    stt = await gateway.transcribe(open(path, "rb").read())
    print("STT result:", (stt or {}).get("text", None) if stt else None)
    os.unlink(path)

    print("\n=== 3. Endpoint status ===")
    for e in gateway.status():
        print(f"{e['provider']:12} {e['model']:38} {e['kind']:5} avail={str(e['available']):5} dead={str(e['dead']):5} err={e['last_error'][:40]}")

asyncio.run(main())
print("\nALL TESTS DONE")
