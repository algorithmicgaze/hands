Install ESP-32 board library from the Arduino IDE:

1. Open the Arduino IDE and go to File > Preferences
2. In the Additional Boards Manager URLs field, add the following URL: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
3. Choose Board > NodeMCU-32S

Install the following libraries from the Arduino IDE:

- PubSubClient

Set upload speed to 115200 (in the Tools menu) and upload the code to the ESP-32 board.