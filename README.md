# 🙌 HANDS 🙌

## Data Conversion

Each recording is stored in a "scene" file that contains additional metadata. The scene is constructed of the mocap data (BVH file) and video file (MP4) file. They are built using the create_scene.py script.

To install the correct dependencies, we use [miniconda](https://docs.conda.io/en/latest/miniconda.html). Once installed, run the following commands to create a new environment and install the dependencies:

```bash
conda create -y -n hands python=3.10
conda activate hands
conda install -y -c conda-forge moviepy librosa
```

We assume the bvh file is in the same directory as the mp4 file, using the same name but with a different extension. To create a scene, run the following command:

```bash
python create_scene.py <MP4 file>
```

## Arduino

Arduino code needs pubsubclient library by Nick O’Leary in order to work with MQTT.

install it with 'manage library' option in arduino

info:
https://pubsubclient.knolleary.net/

## Setup

Raspberry Pi is on 192.168.1.121.
MQTT server is on 192.168.1.121:1883
Websockets are on 192.168.1.121:9001

## Foot Pedal

The visualiser is made to be controlled by a foot pedal, to control play/pause/reset and the send rate. Here is the proper configuration:

- [A] Play/Pause: CC# 64, value ignored
- [B] Save Frame: CC# 67, value ignored
- [C] Restore Frame: CC# 68, value ignored
- [D] Reset: CC# 65, value ignored
- [1] [2] [3] [4] Send Rate (in ms): PC# 66, value 0-127 = at most every 50ms
