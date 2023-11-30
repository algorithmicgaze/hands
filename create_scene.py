import tempfile
import os
import re
import json

from moviepy.editor import VideoFileClip
import librosa
import numpy as np


def extract_audio_segments(
    video_path, min_freq, max_freq, min_volume_db, sample_rate=22050
):
    # Extract audio

    with VideoFileClip(video_path) as video, tempfile.NamedTemporaryFile(
        suffix=".wav", delete=True
    ) as temp_audio_file:
        video_duration = video.duration
        print(f"Video duration: {video_duration} seconds")
        audio = video.audio
        audio.write_audiofile(temp_audio_file.name, codec="pcm_s16le")

        # Load audio
        y, sr = librosa.load(temp_audio_file.name, sr=sample_rate)

    # Perform Short-Time Fourier Transform
    D = librosa.stft(y)
    S_db = librosa.amplitude_to_db(np.abs(D), ref=np.max)

    # Frequency filtering
    freqs = librosa.fft_frequencies(sr=sr)
    target_indices = np.where((freqs >= min_freq) & (freqs <= max_freq))[0]

    # Volume thresholding
    valid_segments = []
    current_segment = None
    for t in range(S_db.shape[1]):
        segment_volume = np.max(S_db[target_indices, t])
        if segment_volume > min_volume_db:
            if current_segment is None:
                current_segment = [t, None]
        else:
            if current_segment is not None:
                current_segment[1] = t
                valid_segments.append(current_segment)
                current_segment = None

    # Convert frame indices to time
    time_segments = [
        (librosa.frames_to_time(seg[0], sr=sr), librosa.frames_to_time(seg[1], sr=sr))
        if seg[1] is not None
        else None
        for seg in valid_segments
    ]

    return time_segments

    # Load audio
    # y, sr =


def split_video_filename(video_file):
    # The regular expression pattern for a date in the format yyyy-mm-dd
    pattern = r"(\d{4}-\d{2}-\d{2})-(.*).mp4"

    # Use re.search to find the first match of the pattern in the video_file string
    match = re.search(pattern, video_file)

    # If a match was found, return the matched date string and the rest of the filename
    if match:
        return match.group(1), match.group(2)
    else:
        return None, None


def create_scene(video_file):
    scene = {}
    recordDate, title = split_video_filename(os.path.basename(video_file))
    scene["recordDate"] = recordDate
    scene["title"] = title
    scene["mocapFile"] = f"{recordDate}-{title}.bvh"
    scene["mocapFrameOffset"] = 0
    scene["videoFile"] = os.path.basename(video_file)
    scene["audioSegments"] = extract_audio_segments(video_file, 300, 1000, -40)

    json_output = json.dumps(scene, indent=2)
    out_filename = f"{os.path.dirname(video_file)}/{recordDate}-{title}.json"
    with open(out_filename, "w") as file:
        file.write(json_output)
    print(f"Scene file written to {out_filename}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("video_file", type=str)
    args = parser.parse_args()
    create_scene(args.video_file)
