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

print(f"Listening for incoming data on {UDP_IP}:{UDP_PORT}")

while True:
    try:
        # Receive data from the socket
        data, addr = sock.recvfrom(4096)  # Buffer size is 4096 bytes

        # Decode and parse the JSON data
        # print(data[:8])
        # json_data = json.loads(data.decode("utf-8"))

        d = frame.decompress(data)  # .decode('utf-8')

        # Print the received JSON data
        print(d)
        with open("data.json", "w") as fp:
            fp.write(d.decode("utf-8"))
    except KeyboardInterrupt:
        print("Shutting down the UDP receiver...")
        break
    except Exception as e:
        print(f"Error: {e}")
