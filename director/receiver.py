import math
from collections import deque
import os
import socket
import json
from lz4 import frame
import matplotlib.pyplot as plt
import numpy as np


# Configure the UDP receiver
UDP_IP = "0.0.0.0"  # Listens on all available interfaces
UDP_PORT = 14043

# Create a socket and bind it to the specified IP and port
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))


def quaternion_to_euler(x, y, z, w):
    ysqr = y * y

    t0 = 2.0 * (w * x + y * z)
    t1 = 1.0 - 2.0 * (x * x + ysqr)
    roll = math.atan2(t0, t1)

    t2 = 2.0 * (w * y - z * x)
    t2 = 1.0 if t2 > 1.0 else t2
    t2 = -1.0 if t2 < -1.0 else t2
    pitch = math.asin(t2)

    t3 = 2.0 * (w * z + x * y)
    t4 = 1.0 - 2.0 * (ysqr + z * z)
    yaw = math.atan2(t3, t4)

    return roll, pitch, yaw


def update_plot(x, y, z, w):
    global xs, ys, zs, ws

    xs.append(x)
    ys.append(y)
    zs.append(z)
    ws.append(w)

    if len(xs) > buffer_size:
        xs.popleft()
        ys.popleft()
        zs.popleft()
        ws.popleft()

    plt.cla()
    plt.plot(xs, label="X")
    plt.plot(ys, label="Y")
    plt.plot(zs, label="Z")
    plt.plot(ws, label="W")
    plt.legend(loc="upper right")
    plt.ylim(-np.pi, np.pi)
    plt.pause(0.0001)


buffer_size = 100
xs = deque()
ys = deque()
zs = deque()
ws = deque()


print(f"Listening for incoming data on {UDP_IP}:{UDP_PORT}")

while True:
    try:
        # Receive data from the socket
        data, addr = sock.recvfrom(16384)  # Buffer size is 4096 bytes

        d = frame.decompress(data)  # .decode('utf-8')
        data = json.loads(d)
        actor = data["scene"]["actors"][0]
        body = actor["body"]

        rightIndexProximal = body["rightIndexProximal"]
        ri_x = rightIndexProximal["rotation"]["x"]
        ri_y = rightIndexProximal["rotation"]["y"]
        ri_z = rightIndexProximal["rotation"]["z"]
        ri_w = rightIndexProximal["rotation"]["w"]
        # ri_roll, ri_pitch, ri_yaw = quaternion_to_euler(ri_x, ri_y, ri_z, ri_w)

        # rightIndexProximal = body["rightIndexMedial"]
        # ri_x = rightIndexProximal["rotation"]["x"]
        # ri_y = rightIndexProximal["rotation"]["y"]
        # ri_z = rightIndexProximal["rotation"]["z"]
        # ri_w = rightIndexProximal["rotation"]["w"]
        # ri_roll, ri_pitch, ri_yaw = quaternion_to_euler(ri_x, ri_y, ri_z, ri_w)
        update_plot(ri_x, ri_y, ri_z, ri_w)
        # print(
        #     "Right Index Medial: Roll: {:.3f}, Pitch: {:.3f}, Yaw: {:.3f}".format(
        #         ri_roll, ri_pitch, ri_yaw
        #     )
        # )

        # json = json.loads(d)

        # Print the received JSON data
        # with open("data.json", "w") as fp:
        #     fp.write(d.decode("utf-8"))
    except KeyboardInterrupt:
        print("Shutting down the UDP receiver...")
        break
    except Exception as e:
        print(f"Error: {e}")
        # print stack trace
        import traceback

        traceback.print_exc()
