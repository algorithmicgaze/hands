# Convert the realtime capture data in NDJSON to protobuf format.
# Usage: python realtime_capture_to_pbf.py <input_file> <output_file>

import argparse
import json

# Make sure to install the protobuf library, then run the following command to generate the python file:
# protoc --python_out=. mocap.proto
import mocap_pb2

bone_names = [
    "hip",
    "spine",
    "chest",
    "neck",
    "head",
    "leftShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightShoulder",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
    "leftUpLeg",
    "leftLeg",
    "leftFoot",
    "leftToe",
    "leftToeEnd",
    "rightUpLeg",
    "rightLeg",
    "rightFoot",
    "rightToe",
    "rightToeEnd",
    "leftThumbProximal",
    "leftThumbMedial",
    "leftThumbDistal",
    "leftThumbTip",
    "leftIndexProximal",
    "leftIndexMedial",
    "leftIndexDistal",
    "leftIndexTip",
    "leftMiddleProximal",
    "leftMiddleMedial",
    "leftMiddleDistal",
    "leftMiddleTip",
    "leftRingProximal",
    "leftRingMedial",
    "leftRingDistal",
    "leftRingTip",
    "leftLittleProximal",
    "leftLittleMedial",
    "leftLittleDistal",
    "leftLittleTip",
    "rightThumbProximal",
    "rightThumbMedial",
    "rightThumbDistal",
    "rightThumbTip",
    "rightIndexProximal",
    "rightIndexMedial",
    "rightIndexDistal",
    "rightIndexTip",
    "rightMiddleProximal",
    "rightMiddleMedial",
    "rightMiddleDistal",
    "rightMiddleTip",
    "rightRingProximal",
    "rightRingMedial",
    "rightRingDistal",
    "rightRingTip",
    "rightLittleProximal",
    "rightLittleMedial",
    "rightLittleDistal",
    "rightLittleTip",
]


def convert(input_file, output_file):
    mocap_data = mocap_pb2.MocapData()
    with open(input_file, "r") as in_file:
        for line in in_file:
            data = json.loads(line)
            scene = data["scene"]
            actor = scene["actors"][0]
            body = actor["body"]
            frame = mocap_pb2.Frame()
            frame.timestamp = scene["timestamp"]
            for i, name in enumerate(bone_names):
                bone = body[name]
                pb_bone = getattr(frame.body, name)
                pb_bone.position.x = bone["position"]["x"]
                pb_bone.position.y = bone["position"]["y"]
                pb_bone.position.z = bone["position"]["z"]
                pb_bone.rotation.x = bone["rotation"]["x"]
                pb_bone.rotation.y = bone["rotation"]["y"]
                pb_bone.rotation.z = bone["rotation"]["z"]
                pb_bone.rotation.w = bone["rotation"]["w"]
            mocap_data.frames.append(frame)
    with open(output_file, "wb") as out_file:
        out_file.write(mocap_data.SerializeToString())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert the realtime capture data in NDJSON to protobuf format."
    )
    parser.add_argument("input_file", help="The input file in NDJSON format")
    parser.add_argument("output_file", help="The output file in protobuf format")
    args = parser.parse_args()
    convert(args.input_file, args.output_file)
