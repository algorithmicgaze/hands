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
