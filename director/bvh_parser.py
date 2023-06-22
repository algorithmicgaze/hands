class Node:
    def __init__(self):
        self.name = ""
        self.type = ""
        self.frames = []
        self.offset = []
        self.channels = []
        self.children = []


def next_line(lines):
    # Skip empty lines
    while True:
        line = lines.pop(0).strip()
        if len(line) > 0:
            return line


def read_node(lines, first_line, list):
    node = Node()
    list.append(node)

    # Parse node type and name
    tokens = first_line.split()
    if tokens[0] == "End" and tokens[1] == "Site":
        node.type = "EndSite"
        node.name = "EndSite"  # BVH end sites have no name
    else:
        node.type = tokens[0]
        node.name = tokens[1]

    if next_line(lines) != "{":
        raise ValueError("BVHLoader: { expected after type and name.")

    # Parse OFFSET
    tokens = next_line(lines).split()
    if tokens[0] != "OFFSET":
        raise ValueError(f"BVHLoader: OFFSET expected but got {tokens[0]}")
    if len(tokens) != 4:
        raise ValueError("BVHLoader: OFFSET has invalid number of values.")

    offset = [float(token) for token in tokens[1:]]
    if any(map(lambda x: x is None, offset)):
        raise ValueError("BVHLoader: OFFSET has invalid values.")
    node.offset = offset

    # Parse CHANNELS
    if node.type != "EndSite":
        tokens = next_line(lines).split()
        if tokens[0] != "CHANNELS":
            raise ValueError(f"BVHLoader: CHANNELS expected but got {tokens[0]}")
        num_channels = int(tokens[1])
        if num_channels is None:
            raise ValueError("BVHLoader: CHANNELS has invalid number of values.")
        if len(tokens) != num_channels + 2:
            raise ValueError("BVHLoader: CHANNELS has invalid number of values.")
        node.channels = tokens[2 : 2 + num_channels]
        node.children = []

    # Read children
    while True:
        line = next_line(lines)
        if line == "}":
            break
        else:
            node.children.append(read_node(lines, line, list))

    return node


def read_frame_data(data, frame_time, bone):
    # End sites have no motion data
    if bone.type == "EndSite":
        return

    # Add keyframe
    frame = {"time": frame_time, "position": [], "rotation": []}
    bone.frames.append(frame)

    # Parse values for each channel
    for channel in bone.channels:
        val = float(data.pop(0).strip())
        if channel == "Xposition":
            frame["position"].append(val)
        elif channel == "Yposition":
            frame["position"].append(val)
        elif channel == "Zposition":
            frame["position"].append(val)
        elif channel == "Xrotation":
            frame["rotation"].append(val)
        elif channel == "Yrotation":
            frame["rotation"].append(val)
        elif channel == "Zrotation":
            frame["rotation"].append(val)
        else:
            raise ValueError(f"BVHLoader: Invalid channel type {channel}")

    # Parse child nodes
    for child in bone.children:
        read_frame_data(data, frame_time, child)


def read_bvh(lines):
    # Read model structure
    if next_line(lines) != "HIERARCHY":
        raise ValueError("BVHLoader: HIERARCHY expected.")

    list = []
    root = read_node(lines, next_line(lines), list)

    # Read motion data
    if next_line(lines) != "MOTION":
        raise ValueError("BVHLoader: MOTION expected.")

    # Number of frames
    tokens = next_line(lines).split()
    if tokens[0] != "Frames:":
        raise ValueError(f"BVHLoader: Frames: expected but got {tokens[0]}")
    num_frames = int(tokens[1])
    if num_frames is None:
        raise ValueError("BVHLoader: Frames: has invalid number of values.")

    # Frame time
    tokens = next_line(lines).split()
    if tokens[0] != "Frame" or tokens[1] != "Time:":
        raise ValueError(
            f"BVHLoader: Frame Time: expected but got {tokens[0]} {tokens[1]}"
        )
    frame_time = float(tokens[2])
    if frame_time is None:
        raise ValueError("BVHLoader: Frame Time: has invalid value.")

    # Parse frames
    for _ in range(num_frames):
        tokens = next_line(lines).split()
        read_frame_data(tokens, _ * frame_time, root)

    return list


def parse_bvh(text):
    lines = text.split("\n")
    bones = read_bvh(lines)
    return bones
