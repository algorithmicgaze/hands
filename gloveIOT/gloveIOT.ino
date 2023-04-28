#include <PubSubClient.h>
#include <WiFi.h>

#define MIN(a,b) (((a)<(b))?(a):(b))

// todo: add ine home - router 
const char* ssid_list[] = {"CS-IoT", "WiFi-2.4-CAB0"};
const char* password_list[] = {"SLA-JD1PDcs!", "wr43kdnz2a7xm"};
const int num_networks = 2;

const char* mqttServer = "lieme.cloud.shiftr.io";
const int mqttPort = 1883;
const char* mqttUser = "lieme";
const char* mqttPassword = "x7iNJWfycxrdEz51";

WiFiClient espKlant;
PubSubClient client(espKlant);

// info: rechterhand duim niet - linkerhand wel
// todo: define which pin is which finger!
int pins[] = {2, 4, 16, 17, 12, 14, 27, 26, 25};
int numPins = 9;

void setup() {
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
      delay(500);
      Serial.print(".");
      retries++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("");
      Serial.println("WiFi connected");
      Serial.println("IP address: ");
      Serial.println(WiFi.localIP());
      break; // exit
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
    String clientId = "esp32";
    if (client.connect(clientId.c_str(), mqttUser, mqttPassword)) {
      Serial.println(" OK!");
      client.publish("chat", "esp32_connected");
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
  if(!client.connected()){
    reconnect();
  }
  client.loop();
}

void onMessage(const char* topic, byte* payload, unsigned int length) {
  if (length == 0) return;

  char* message = (char*) payload;
  char command = message[0];
  char buffer[200] = { 0 };
  strncpy(buffer, message, MIN(length, 199));
  Serial.println("message received:");
  Serial.println(buffer);
  //Serial.println(message);

  if (message[0] == '1') {
    digitalWrite(pins[0], HIGH);
  } else {
    digitalWrite(pins[0], LOW);
  }

  if (message[1] == '1') {
    digitalWrite(pins[1], HIGH);
  } else {
    digitalWrite(pins[1], LOW);
  }
  // more to follow when i know the pin-finger relation

}
