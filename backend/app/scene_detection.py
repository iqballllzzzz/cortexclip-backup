"""Scene detection for reframe pipeline - PySceneDetect (ContentDetector).

Reliable shot boundary detection. Falls back gracefully if deps missing.

Environment variables:
  SCENE_MIN_SEC         minimum scene length in seconds; shorter scenes merged
"""

import os
import subprocess

import cv2
import numpy as np

try:
    from scenedetect import open_video, SceneManager, FrameTimecode
    from scenedetect.detectors import ContentDetector
    SCENEDETECT_AVAILABLE = True
except ImportError:
    SCENEDETECT_AVAILABLE = False


def detect_scenes(video_path):
    """Detect scenes. Returns (scene_list, fps) where scene_list is a list of
    (FrameTimecode, FrameTimecode) pairs — same contract as PySceneDetect's
    SceneManager.get_scene_list().
    """
    if not SCENEDETECT_AVAILABLE:
        # Final fallback: single scene covering entire video
        return _single_scene_fallback(video_path)
    return _detect_pyscenedetect(video_path)


# --- PySceneDetect engine ---------------------------------------------------

def _detect_pyscenedetect(video_path):
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector())
    scene_manager.detect_scenes(video=video)
    scene_list = scene_manager.get_scene_list()
    fps = video.frame_rate
    return scene_list, fps


def _single_scene_fallback(video_path):
    """When no scene detection available, return one scene covering all frames."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    from scenedetect import FrameTimecode
    if not SCENEDETECT_AVAILABLE:
        # Define minimal FrameTimecode-like objects
        class _FT:
            def __init__(self, frames, fps): self.frames = frames; self.fps = fps
            def get_frames(self): return self.frames
        return [(_FT(0, fps), _FT(total_frames, fps))], fps
    return [(FrameTimecode(0, fps), FrameTimecode(total_frames, fps))], fps