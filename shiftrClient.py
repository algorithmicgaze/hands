# pip3 install paho-mqtt 
import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, rc):
    print("Connected with result code "+str(rc))
    client.subscribe("hands")

def on_message(client, userdata, msg):
    print(msg.topic+" "+str(msg.payload))

client = mqtt.Client()

client.on_connect = on_connect
client.on_message = on_message

client.username_pw_set("lieme", "x7iNJWfycxrdEz51")

client.connect("lieme.cloud.shiftr.io", 1883, 60)

client.loop_forever()