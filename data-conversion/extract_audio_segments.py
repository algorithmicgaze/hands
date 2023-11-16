from moviepy.editor import VideoFileClip

import librosa
import numpy as np
import json


def extract_audio_segments(
    video_path, min_freq, max_freq, min_volume_db, sample_rate=22050
):
    # Extract audio

    with VideoFileClip(video_path) as video:
        audio = video.audio
        audio.write_audiofile("temp_audio.wav", codec="pcm_s16le")

    # Load audio
    y, sr = librosa.load("temp_audio.wav", sr=sample_rate)

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


segments = extract_audio_segments("../_data/064A3051_720.mov", 300, 1000, -40)

# Convert to JSON
json_output = json.dumps({"segments": segments}, indent=4)
with open("output.json", "w") as file:
    file.write(json_output)

print("JSON file created with audio segments.")
