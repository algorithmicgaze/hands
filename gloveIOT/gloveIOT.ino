#include <PubSubClient.h>
#include <WiFi.h>

const char* ssid ="CS-IoT";
const char* password = "SLA-JD1PDcs!";

const char* mqttServer = "lieme.cloud.shiftr.io";
const int mqttPort = 1883;
const char* mqttUser = "lieme";
const char* mqttPassword = "x7iNJWfycxrdEz51";

WiFiClient espKlant;
PubSubClient client(espKlant);

// rechterhand
const int first = 2;    // pink - orange
const int second = 4;   // ring - green
const int third = 16;   // middle - blue
const int fourth = 17;  // index - brown

//linkerhandk
const int fifth = 12;
const int sixth = 14;
const int seventh = 27;
const int eight = 26;
const int nine = 25;

// rechterhand duim niet - linkerhand wel

void setup() {
  // put your setup code here, to run once:
  pinMode(first, OUTPUT);
  pinMode(second, OUTPUT);
  pinMode(third, OUTPUT);
  pinMode(fourth, OUTPUT);
  pinMode(fifth, OUTPUT);
  pinMode(sixth, OUTPUT);
  pinMode(seventh, OUTPUT);
  pinMode(eight, OUTPUT);
  pinMode(nine, OUTPUT);
  WiFi.begin(ssid, password);
  Serial.println("connecting to wifi");
  while(WiFi.status() != WL_CONNECTED){
    delay(500);
    Serial.print(".");
  }
  Serial.print("connected to ");
  Serial.println(WiFi.localIP());
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
      client.subscribe("sms");

    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      // Wait 5 seconds before retrying
      delay(5000);
    }
  }
}

void loop() {
  // put your main code here, to run repeatedly:
  if(!client.connected()){
    reconnect();
  }
  client.loop();
/*
  digitalWrite(first, HIGH);
  delay(300);
  digitalWrite(first, LOW);
  delay(200);

  digitalWrite(second, HIGH);
  delay(300);
  digitalWrite(second, LOW);
  delay(200);

  digitalWrite(third, HIGH);
  delay(300);
  digitalWrite(third, LOW);
  delay(200);

  digitalWrite(fourth, HIGH);
  delay(300);
  digitalWrite(fourth, LOW);
  delay(200);

  digitalWrite(fifth, HIGH);
  delay(300);
  digitalWrite(fifth, LOW);
  delay(200);

  digitalWrite(sixth, HIGH);
  delay(300);
  digitalWrite(sixth, LOW);
  delay(200);

  digitalWrite(seventh, HIGH);
  delay(300);
  digitalWrite(seventh, LOW);
  delay(200);

  digitalWrite(eight, HIGH);
  delay(300);
  digitalWrite(eight, LOW);
  delay(200);
  */
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
}
