// Returns the next non-empty line
/**
 * @param {string[]} lines
 */
function _nextLine(lines) {
  let line;
  // Skip empty lines
  while ((line = lines.shift().trim()).length === 0) {}
  return line;
}

/**
 * Recursively parses the HIERARCHY section of a BVH file
 * @param {any} lines: array of lines
 * @param {string} firstLine: first line of the current node
 * @param {any[]} list: list of bones, used in recursive calls
 * @return: a BVH node including children
 */
function _readNode(lines, firstLine, list) {
  const node = { name: "", type: "", frames: [] };
  list.push(node);

  // Parse node type and name
  let tokens = firstLine.split(/[\s]+/);
  if (tokens[0] === "End" && tokens[1] === "Site") {
    node.type = "EndSite";
    node.name = "EndSite"; // BVH end sites have no name
  } else {
    node.type = tokens[0];
    node.name = tokens[1];
  }

  if (_nextLine(lines) !== "{") {
    throw new Error("BVHLoader: { expected after type and name.");
  }

  // Parse OFFSET
  tokens = _nextLine(lines).split(/[\s]+/);
  if (tokens[0] !== "OFFSET") {
    throw new Error("BVHLoader: OFFSET expected but got " + tokens[0]);
  }
  if (tokens.length !== 4) {
    throw new Error("BVHLoader: OFFSET has invalid number of values.");
  }

  const offset = [
    parseFloat(tokens[1]),
    parseFloat(tokens[2]),
    parseFloat(tokens[3]),
  ];
  if (isNaN(offset[0]) || isNaN(offset[1]) || isNaN(offset[2])) {
    throw new Error("BVHLoader: OFFSET has invalid values.");
  }
  node.offset = offset;

  // Parse CHANNELS
  if (node.type !== "EndSite") {
    tokens = _nextLine(lines).split(/[\s]+/);
    if (tokens[0] !== "CHANNELS") {
      throw new Error("BVHLoader: CHANNELS expected but got " + tokens[0]);
    }
    const numChannels = parseInt(tokens[1]);
    if (isNaN(numChannels)) {
      throw new Error("BVHLoader: CHANNELS has invalid number of values.");
    }
    if (tokens.length !== numChannels + 2) {
      throw new Error("BVHLoader: CHANNELS has invalid number of values.");
    }
    node.channels = tokens.splice(2, numChannels);
    node.children = [];
  }

  // Read children
  while (true) {
    const line = _nextLine(lines);
    if (line === "}") {
      break;
    } else {
      node.children.push(_readNode(lines, line, list));
    }
  }

  return node;
}

/**
 * @param {string[]} data
 * @param {number} frameTime
 * @param {{ name?: string; type: any; frames: any; channels?: any; children?: any; }} bone
 */
function _readFrameData(data, frameTime, bone) {
  // End sites have no motion data
  if (bone.type === "EndSite") {
    return;
  }

  // Add keyframe
  const frame = { time: frameTime, position: [], rotation: [] };
  bone.frames.push(frame);

  // Quaternion magic

  // Parse values for each channel
  for (let i = 0; i < bone.channels.length; i++) {
    const channel = bone.channels[i];
    switch (channel) {
      case "Xposition":
        frame.position[0] = parseFloat(data.shift().trim());
        break;
      case "Yposition":
        frame.position[1] = parseFloat(data.shift().trim());
        break;
      case "Zposition":
        frame.position[2] = parseFloat(data.shift().trim());
        break;
      case "Xrotation":
        // frame.rotation[0] = (parseFloat(data.shift().trim()) * Math.PI) / 180;
        frame.rotation[0] = parseFloat(data.shift().trim());
        break;
      case "Yrotation":
        // frame.rotation[1] = (parseFloat(data.shift().trim()) * Math.PI) / 180;
        frame.rotation[1] = parseFloat(data.shift().trim());
        break;
      case "Zrotation":
        // frame.rotation[2] = (parseFloat(data.shift().trim()) * Math.PI) / 180;
        frame.rotation[2] = parseFloat(data.shift().trim());
        break;
      default:
        throw new Error("BVHLoader: Invalid channel type " + channel);
    }
  }

  // Parse child nodes
  for (let i = 0; i < bone.children.length; i++) {
    _readFrameData(data, frameTime, bone.children[i]);
  }
}

// Reads an array of lines from a BVH file
// And outputs a skeleton structure including motion data.
/**
 * @param {any} lines
 */
function _readBvh(lines) {
  // Read model structure
  if (_nextLine(lines) !== "HIERARCHY") {
    throw new Error("BVHLoader: HIERARCHY expected.");
  }

  const list = [];
  const root = _readNode(lines, _nextLine(lines), list);

  // Read motion data
  if (_nextLine(lines) !== "MOTION") {
    throw new Error("BVHLoader: MOTION expected.");
  }

  // Number of frames
  let tokens = _nextLine(lines).split(/[\s]+/);
  if (tokens[0] !== "Frames:") {
    throw new Error("BVHLoader: Frames: expected but got " + tokens[0]);
  }
  const numFrames = parseInt(tokens[1]);
  if (isNaN(numFrames)) {
    throw new Error("BVHLoader: Frames: has invalid number of values.");
  }

  // Frame time
  tokens = _nextLine(lines).split(/[\s]+/);
  if (tokens[0] !== "Frame" || tokens[1] !== "Time:") {
    throw new Error(
      "BVHLoader: Frame Time: expected but got " + tokens[0] + " " + tokens[1]
    );
  }
  const frameTime = parseFloat(tokens[2]);
  if (isNaN(frameTime)) {
    throw new Error("BVHLoader: Frame Time: has invalid value.");
  }

  // Parse frames
  for (let i = 0; i < numFrames; i++) {
    tokens = _nextLine(lines).split(/[\s]+/);
    _readFrameData(tokens, i * frameTime, root);
  }

  return list;
}

/**
 * @param {string} text
 */
export function parseBvh(text) {
  const lines = text.split(/[\r\n]+/g);
  const bones = _readBvh(lines);
  return bones;
}
