#include <PubSubClient.h>
#include <WiFi.h>

#define MIN(a, b) (((a) < (b)) ? (a) : (b))

#define RGB_BRIGHTNESS 10

#ifdef RGB_BUILTIN
#undef RGB_BUILTIN
#endif
#define RGB_BUILTIN 10

// wifi connections. needs a pw update sometimes.
const char* ssid_list[] = { "HANDS", "CS-IoT", "Proximus-Home-827079", "iotd" };
const char* password_list[] = { "95203737", "SLA-YTEdScs!", "homebase", "k?Uh6XrV" };
const int num_networks = 4;

// shiftr broker
const char* mqttServer = "algorithmicgaze.cloud.shiftr.io";
const int mqttPort = 1883;
const char* mqttUser = "algorithmicgaze";
const char* mqttPassword = "oyxIrENHt8mM2ONQ";

// mac broker
// const char* mqttServer = "192.168.1.111";
// const int mqttPort = 1883;
// const char* mqttUser = NULL;
// const char* mqttPassword = NULL;

WiFiClient espKlant;
PubSubClient client(espKlant);

//int pins[] = { 2, 4, 16, 17, 19, 12, 14, 27, 26, 25 };
int pins[] = { 4, 3, 2, 1};

int numPins = 4;

void setup() {
  Serial.begin(115200);
  //pinMode(LED_BUILTIN, OUTPUT);
  for (int i = 0; i < numPins; i++) {
    pinMode(pins[i], OUTPUT);
  }
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
      neopixelWrite(RGB_BUILTIN, 0, RGB_BRIGHTNESS, 0);
      delay(500);
      neopixelWrite(RGB_BUILTIN, 0, 0, 0);
      delay(100);
      Serial.print(".");
      retries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      neopixelWrite(RGB_BUILTIN,RGB_BRIGHTNESS, 0, 0);
      Serial.println("");
      Serial.println("WiFi connected");
      Serial.println("IP address: ");
      Serial.println(WiFi.localIP());
      //digitalWrite(ledConnection, HIGH);
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
    String clientId = "mini_left";
    if (client.connect(clientId.c_str(), mqttUser, mqttPassword)) {
      Serial.println(" OK!");
      client.publish("info_left", "mini left connected");
      client.subscribe("hands");
      neopixelWrite(RGB_BUILTIN, 0, 0, RGB_BRIGHTNESS);
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

  char buffer[200] = { 0 };
  strncpy(buffer, (char*)payload, MIN(length, 199));
  buffer[length] = '\0';

  Serial.println("Message received: ");
  Serial.println(buffer);

  int numPinsToProcess = MIN(4, length);
  for (int i = 0; i < numPinsToProcess; i++) {
    if (buffer[i] == '1') {
      digitalWrite(pins[i], HIGH);
    } else if (buffer[i] == '0') {
      digitalWrite(pins[i], LOW);
    } else {
      Serial.print("Invalid character at position ");
      Serial.print(i);
      Serial.println(": expected '0' or '1'");
    }
  }
}
