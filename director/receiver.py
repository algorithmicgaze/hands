import math

import os
import socket
import json
from lz4 import frame

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


print(f"Listening for incoming data on {UDP_IP}:{UDP_PORT}")

while True:
    try:
        # Receive data from the socket
        data, addr = sock.recvfrom(4096)  # Buffer size is 4096 bytes

        # Decode and parse the JSON data
        # print(data[:8])
        # json_data = json.loads(data.decode("utf-8"))

        d = frame.decompress(data)  # .decode('utf-8')
        data = json.loads(d)
        actor = data["scene"]["actors"][0]
        # print(actor)
        body = actor["body"]
        # pos = body["leftIndexProximal"]["rotation"]
        # print(pos["x"], pos["y"], pos["z"])

        rightIndexProximal = body["rightIndexProximal"]
        ri_x = rightIndexProximal["rotation"]["x"]
        ri_y = rightIndexProximal["rotation"]["y"]
        ri_z = rightIndexProximal["rotation"]["z"]
        ri_w = rightIndexProximal["rotation"]["w"]
        ri_roll, ri_pitch, ri_yaw = quaternion_to_euler(ri_x, ri_y, ri_z, ri_w)
        # print(
        #     "Right Index Proximal: Roll: {:.3f}, Pitch: {:.3f}, Yaw: {:.3f}".format(
        #         ri_roll, ri_pitch, ri_yaw
        #     )
        # )

        rightIndexProximal = body["rightIndexMedial"]
        ri_x = rightIndexProximal["rotation"]["x"]
        ri_y = rightIndexProximal["rotation"]["y"]
        ri_z = rightIndexProximal["rotation"]["z"]
        ri_w = rightIndexProximal["rotation"]["w"]
        ri_roll, ri_pitch, ri_yaw = quaternion_to_euler(ri_x, ri_y, ri_z, ri_w)
        print(
            "Right Index Medial: Roll: {:.3f}, Pitch: {:.3f}, Yaw: {:.3f}".format(
                ri_roll, ri_pitch, ri_yaw
            )
        )

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
