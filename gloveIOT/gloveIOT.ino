#include <PubSubClient.h>
#include <WiFi.h>

#define MIN(a,b) (((a)<(b))?(a):(b))

// todo: add ine home - router 
const char* ssid_list[] = {"HANDS", "CS-IoT", "WiFi-2.4-CAB0"};
const char* password_list[] = {"95203737", "SLA-JD1PDcs!", "wr43kdnz2a7xm"};
const int num_networks = 3;

const char* mqttServer = "lieme.cloud.shiftr.io";
const int mqttPort = 1883;
const char* mqttUser = "lieme";
const char* mqttPassword = "x7iNJWfycxrdEz51";

WiFiClient espKlant;
PubSubClient client(espKlant);


int pins[] = {2, 4, 16, 17, 19, 12, 14, 27, 26, 25};
int numPins = 10;

void setup() {
  Serial.begin(115200);
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

int messageLength = strlen(message);
Serial.print("incoming: ");
Serial.println(messageLength);
Serial.print("message length");
Serial.println(length);
for (int i = 0; i < length; i++) {
  if (message[i] == '1') {
    digitalWrite(pins[i], HIGH);
  } else {
    digitalWrite(pins[i], LOW);   
  }
}

}
