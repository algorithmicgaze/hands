# pip3 install paho-mqtt
import time
import paho.mqtt.client as mqtt
from random import choice


def send_random_message():
    bit_pattern = ""
    for i in range(10):
        bit_pattern += choice(["0", "1"])

    client.publish("hands", bit_pattern)


def on_connect(client, userdata, flags, rc):
    print("Connected with result code " + str(rc))
    # client.subscribe("hands")


# def on_message(client, userdata, msg):
#     print(msg.topic+" "+str(msg.payload))

client = mqtt.Client()

client.on_connect = on_connect
# client.on_message = on_message
# mqtt://fdb001:sEKIbUaSWWD53UcR@fdb001.cloud.shiftr.io


client.username_pw_set("fdb001", "sEKIbUaSWWD53UcR")

client.connect("fdb001.cloud.shiftr.io", 1883, 60)

while True:
    client.loop(timeout=0.1, max_packets=1)
    send_random_message()
    time.sleep(1.0)

    # client.loop_forever()
    # client.loop_start()
    # client.loop_stop()
    # client.disconnect()
