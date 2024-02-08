

int pins[] = { 2, 4, 16, 17, 19, 12, 14, 27, 26, 25 };  // 27 touch
int numPins = 10;

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < numPins; i++) {
    pinMode(pins[i], OUTPUT);
  }
}


void loop() {
  for (int i = 0; i < 255; i += 10) {
    Serial.println(i);
    analogWrite(pins[7], i);
    delay(2000);
  }
  delay(1000);
}
