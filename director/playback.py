# Reads in BVH data and plays it back over Shiftr.

from collections import deque
import argparse
import bvh_parser
import time

import paho.mqtt.client as mqtt


def on_connect(client, userdata, flags, rc):
    print("Connected with result code " + str(rc))


client = mqtt.Client()
client.on_connect = on_connect
client.username_pw_set("fdb001", "sEKIbUaSWWD53UcR")
client.connect("fdb001.cloud.shiftr.io", 1883, 60)


def parse_bvh_file(filename):
    return bvh_parser.parse_bvh(open(filename).read())


def find_bone(bones, name):
    for bone in bones:
        if bone.name == name:
            return bone
    raise ValueError(f"Bone {name} not found.")


def moving_average(frames, window_size=2):
    averages = []
    queue = deque(maxlen=window_size)
    for frame in frames:
        x, y, z = frame["rotation"]
        mag = x**2 + y**2 + z**2
        queue.append(mag)
        if len(queue) == window_size:
            averages.append(sum(mag for mag in queue) / window_size)
    return averages


def send_message(finger_bools):
    bit_pattern = "".join([b and "1" or "0" for b in finger_bools])
    # bit_pattern = ""
    # for i in range(10):
    #     bit_pattern += choice(["0", "1"])

    client.publish("hands", bit_pattern)


def finger_delta(bone_data, frame):
    x, y, z = bone_data[frame]["rotation"]
    mag = x**2 + y**2 + z**2
    prev_x, prev_y, prev_z = bone_data[frame - 1]["rotation"]
    prev_mag = prev_x**2 + prev_y**2 + prev_z**2
    return mag - prev_mag


def animation_loop(bones):
    # A list of fingers and whether they are pressed (True) or not (False).

    prev_finger_bools = [
        False,
        False,
        False,
        False,
        False,
        False,
        False,
        False,
        False,
        False,
    ]

    # Get finger bones
    left_pinky = find_bone(bones, "LeftFinger5Proximal")
    left_ring = find_bone(bones, "LeftFinger4Proximal")
    left_middle = find_bone(bones, "LeftFinger3Proximal")
    left_index = find_bone(bones, "LeftFinger2Proximal")
    left_thumb = find_bone(bones, "LeftFinger1Proximal")

    right_thumb = find_bone(bones, "RightFinger1Proximal")
    right_index = find_bone(bones, "RightFinger2Proximal")
    right_middle = find_bone(bones, "RightFinger3Proximal")
    right_ring = find_bone(bones, "RightFinger4Proximal")
    right_pinky = find_bone(bones, "RightFinger5Proximal")

    finger_bones = [
        left_pinky,
        left_ring,
        left_middle,
        left_index,
        left_thumb,
        right_thumb,
        right_index,
        right_middle,
        right_ring,
        right_pinky,
    ]

    frame_count = len(right_thumb.frames)

    # Skip frame 0 which is the bind pose
    frame = 1
    wait_frames = 0
    while True:
        finger_deltas = [finger_delta(bone.frames, frame) for bone in finger_bones]
        finger_bools = [delta > 100 for delta in finger_deltas]

        if finger_bools != prev_finger_bools and wait_frames > 50:
            send_message(finger_bools)
            prev_finger_bools = finger_bools
            wait_frames = 0

        time.sleep(0.01)
        wait_frames += 1
        frame += 1
        if frame >= frame_count:
            frame = 1


def main():
    parser = argparse.ArgumentParser(description="Play back BVH data over Shiftr.")
    parser.add_argument("bvh_file", help="BVH file to play back")

    args = parser.parse_args()
    bones = parse_bvh_file(args.bvh_file)

    animation_loop(bones)


if __name__ == "__main__":
    main()
