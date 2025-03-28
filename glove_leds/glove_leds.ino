#include <PubSubClient.h>
#include <WiFi.h>
#include <FastLED.h>
#define NUM_LEDS 10
#define DATA_PIN 2

#define MIN(a, b) (((a) < (b)) ? (a) : (b))

const char* ssid_list[] = { "HANDS", "CS-IoT", "Proximus-Home-827079", "iotd" };
const char* password_list[] = { "95203737", "SLA-YTEdScs!", "homebase", "k?Uh6XrV" };
const int num_networks = 4;

/* shiftr broker
const char* mqttServer = "algorithmicgaze.cloud.shiftr.io";
const int mqttPort = 1883;
const char* mqttUser = "algorithmicgaze";
const char* mqttPassword = "oyxIrENHt8mM2ONQ";
//*/

// mac broker
///*
const char* mqttServer = "192.168.1.121";
const int mqttPort = 1883;
const char* mqttUser = NULL;
const char* mqttPassword = NULL;
//*/


WiFiClient espKlant;
PubSubClient client(espKlant);
CRGB leds[NUM_LEDS];

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  for (int i = 0; i < num_networks; i++) {
    const char* ssid = ssid_list[i];
    const char* password = password_list[i];

    Serial.print("Connecting to ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);

    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 10) {
      delay(500);
      Serial.print(".");
      retries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("");
      Serial.println("WiFi connected");
      Serial.println("IP address: ");
      Serial.println(WiFi.localIP());
      break;  // exit
    } else {
      Serial.println("");
      Serial.println("Connection failed");
    }
  }

  client.setServer(mqttServer, mqttPort);
  client.setCallback(onMessage);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "esp32-lights";
    if (client.connect(clientId.c_str(), mqttUser, mqttPassword)) {
      Serial.println(" OK!");
      client.publish("lights", "led_bar connected");
      client.subscribe("hands");

    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
}

void onMessage(const char* topic, byte* payload, unsigned int length) {
  if (length == 0) return;

  char* message = (char*)payload;
  char command = message[0];
  char buffer[200] = { 0 };
  strncpy(buffer, message, MIN(length, 199));
  Serial.println("message received:");
  Serial.println(buffer);

  int messageLength = strlen(message);
  Serial.print("incoming: ");
  Serial.println(messageLength);
  Serial.print("message length");
  Serial.println(length);


  for (int i = 0; i < length; i++) {
    if (message[i] == '1') {
      leds[i] = CRGB::DodgerBlue;
    } else {
      leds[i] = CRGB::Black;
    }
    FastLED.show();
  }
}
