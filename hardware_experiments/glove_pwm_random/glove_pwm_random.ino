int pins[] = { 2, 4, 16, 17, 19, 12, 14, 27, 26, 25 };  // Array of pin numbers
int numPins = 10;  // Number of pins

void setup() {
  Serial.begin(115200);  // Initialize serial communication
  for (int i = 0; i < numPins; i++) {
    pinMode(pins[i], OUTPUT);  // Set each pin as an output
  }
  randomSeed(analogRead(0));  // Initialize random number generator with noise from analog pin 0
}

void loop() {
  int randValue = random(40, 201);  // Generate a random value between 100 and 200 (inclusive)
  Serial.println(randValue);  // Print the random value to the serial monitor
  analogWrite(pins[7], randValue);  // Write the random value to pin 7
  delay(random(100, 500));  // Wait for 2000 milliseconds (2 seconds)
}
