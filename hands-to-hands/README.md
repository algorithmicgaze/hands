# Hands to Hands

Rokoko glove OSC input to 10-bit haptic hand output.

The signal path is:

1. Rokoko sends OSC to Node.js.
2. Node.js maps each glove finger to the matching haptic finger.
3. Node.js publishes the 10-bit pattern to MQTT/Shiftr.
4. The browser is only a visualization and control surface.

Bit order is:

```text
left.thumb left.index left.middle left.ring left.pinky right.thumb right.index right.middle right.ring right.pinky
```

So `0100000000` means the left index finger is active.

## Run

```sh
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Useful options:

```sh
node server.js --osc-port 8000 --mqtt-url ws://192.168.1.121:9001 --mqtt-topic hands
node server.js --enabled
node server.js --config config.json
node server.js --replay-fbx ../realtime/demo_data/hands-3-playing-minimal.fbx --replay-fps 30
```

The UI shows exact threshold, global threshold scale, smoothing, and release values as JSON so they can be copied into a config file once calibrated. `thresholdScale` defaults to `1`; lower values make all fingers more sensitive, higher values make all fingers less sensitive.

The built-in defaults come from the FBX calibration clips in `../realtime/demo_data`. The metric is summed per-frame quaternion-angle movement across the joints of each finger, so thresholds respond to motion rather than static hand pose.

To regenerate the calibration report:

```sh
npm run calibrate
```

Before handing off changes, run:

```sh
npm run smoke
```

That smoke test starts a temporary server, checks that browser module scripts are served with JavaScript MIME types, and verifies that FBX replay produces websocket frames.

The default MQTT target is the local broker at `ws://192.168.1.121:9001`. A working `algorithmicgaze` Shiftr Cloud URL is kept as a commented alternative in `server.js`. The browser reports `MQTT connected` only after Node has connected to the selected broker.

## OSC shape

By default, the server accepts addresses like:

```text
/hands/left/index
/rokoko/right/pinky
```

The first one to four numeric OSC arguments are used. Node compares each incoming value/vector to the previous value for that finger and thresholds the movement delta.
