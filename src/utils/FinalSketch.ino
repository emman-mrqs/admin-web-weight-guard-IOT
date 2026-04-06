#include <HX711_ADC.h>
#include <EEPROM.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <TinyGPSPlus.h>
#include <WiFi.h>
#include <HTTPClient.h>

const int HX711_dout = 4;
const int HX711_sck  = 5;
HX711_ADC LoadCell(HX711_dout, HX711_sck);

const int calVal_eepromAdress = 0;

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// -------------------- WIFI / WEBSITE --------------------
const char* ssid = "GlobeAtHome_e7a38_2.4";
const char* password = "pwa4AnGt";
const char* serverName = "http://192.168.254.105:3000/api/realtime/esp32/tracking";
const char* esp32ApiKey = ""; // Optional: set this if your backend uses ESP32_SHARED_KEY
const int vehicleId = 1;
bool enableWebsiteSend = true;
bool enableRealtimeStream = true;
const unsigned long realtimeStreamIntervalMs = 800;

// -------------------- GPS --------------------
TinyGPSPlus gps;
HardwareSerial GPSserial(2);

double gpsLat = 0.0;
double gpsLng = 0.0;
double gpsSpeed = 0.0;
double gpsAltitude = 0.0;
double gpsHeading = 0.0;
int gpsSats = 0;

// -------------------- timing --------------------
unsigned long lastUpdate = 0;
unsigned long lastRealtimeStreamSentAt = 0;

// -------------------- weights --------------------
float currentWeight = 0.0;
float confirmedWeight = 0.0;
float detectedWeight = 0.0;
float removedWeight = 0.0;
float previousConfirmedWeight = 0.0;

// -------------------- thresholds --------------------
const float detectThreshold = 30.0;
const float zeroNoise = 1.0;
const float changeThreshold = 20.0;

// -------------------- states --------------------
enum SystemState {
  IDLE,
  WAIT_CONFIRM_OBJECT,
  ASK_ADD_ANOTHER,
  WAIT_ADDITIONAL_OBJECT,
  MONITOR_CONFIRMED,
  WAIT_REMOVE_ACTION,
  WAIT_CONFIRM_REMOVAL,
  WAIT_RETURN_REMOVED_OBJECT,
  CARGO_LOSS_STATE
};

SystemState state = IDLE;

// -------------------- display helpers --------------------
void clearBase() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
}

void showLiveWeight(float weight) {
  clearBase();
  display.println("Weight:");

  display.setTextSize(3);
  display.setCursor(0, 20);
  display.print(weight, 1);
  display.println(" g");
  display.display();
}

void showConfirmObject(float weight) {
  clearBase();
  display.println("Object/Weight:");

  display.setTextSize(2);
  display.setCursor(0, 16);
  display.print(weight, 1);
  display.println(" g");

  display.setTextSize(1);
  display.setCursor(0, 50);
  display.println("Confirm y/n");
  display.display();
}

void showConfirmed(float weight) {
  clearBase();
  display.setTextSize(2);
  display.println("CONFIRMED");
  display.setCursor(0, 28);
  display.print(weight, 1);
  display.println(" g");
  display.display();
}

void showRejected(float weight) {
  clearBase();
  display.setTextSize(2);
  display.println("REJECTED");
  display.setCursor(0, 28);
  display.print(weight, 1);
  display.println(" g");
  display.display();
}

void showAddAnother(float weight) {
  clearBase();
  display.println("Confirmed total:");
  display.print(weight, 1);
  display.println(" g");
  display.println("");
  display.println("Add another?");
  display.println("y/n");
  display.display();
}

void showWaitingAdditional(float weight) {
  clearBase();
  display.println("Protected total:");
  display.print(weight, 1);
  display.println(" g");
  display.println("");
  display.println("Place another");
  display.println("object...");
  display.display();
}

void showProtectedTotal(float weight) {
  clearBase();
  display.println("Protected total:");

  display.setTextSize(2);
  display.setCursor(0, 18);
  display.print(weight, 1);
  display.println(" g");

  display.setTextSize(1);
  display.setCursor(0, 52);
  display.println("Type r to remove");
  display.display();
}

void showRemoveNow(float weight) {
  clearBase();
  display.println("Protected total:");
  display.print(weight, 1);
  display.println(" g");
  display.println("");
  display.println("Remove one object");
  display.println("now...");
  display.display();
}

void showConfirmRemoved(float removed, float newTotal) {
  clearBase();
  display.println("Removed:");
  display.print(removed, 1);
  display.println(" g");
  display.print("New total: ");
  display.print(newTotal, 1);
  display.println(" g");
  display.println("Confirm y/n");
  display.display();
}

void showReturnRemovedObject(float missing) {
  clearBase();
  display.println("Removal rejected");
  display.print("Return: ");
  display.print(missing, 1);
  display.println(" g");
  display.display();
}

void showCargoLoss(float missing) {
  clearBase();
  display.setTextSize(2);
  display.println("CARGO LOSS");

  display.setTextSize(1);
  display.println("");
  display.print("Missing: ");
  display.print(missing, 1);
  display.println(" g");
  display.display();
}

// -------------------- helpers --------------------
void normalizeWeight() {
  if (currentWeight > -zeroNoise && currentWeight < zeroNoise) {
    currentWeight = 0.0;
  }
}

void resetToIdle() {
  confirmedWeight = 0.0;
  detectedWeight = 0.0;
  removedWeight = 0.0;
  previousConfirmedWeight = 0.0;
  state = IDLE;
}

void printAddAnotherPrompt() {
  Serial.println("Add another object/weight? y/n");
}

void printConfirmPrompt() {
  Serial.println("Confirm this object/weight? y/n");
}

void printRemovePrompt() {
  Serial.println("Type r to remove one object/weight.");
}

void printGPSData() {
  Serial.println("----- GPS DATA -----");

  Serial.print("Latitude: ");
  Serial.println(gpsLat, 6);

  Serial.print("Longitude: ");
  Serial.println(gpsLng, 6);

  Serial.print("Speed (km/h): ");
  Serial.println(gpsSpeed);

  Serial.print("Satellites: ");
  Serial.println(gpsSats);

  Serial.print("Altitude (m): ");
  Serial.println(gpsAltitude);

  Serial.println("--------------------");
}

void printGPSOnCargoLoss() {
  if (gps.location.isValid()) {
    Serial.print("Location -> Lat: ");
    Serial.print(gpsLat, 6);
    Serial.print(" | Lng: ");
    Serial.print(gpsLng, 6);
    Serial.print(" | Speed: ");
    Serial.print(gpsSpeed, 2);
    Serial.print(" km/h | Sats: ");
    Serial.println(gpsSats);
  } else {
    Serial.println("GPS location not valid yet.");
  }
}

// -------------------- WIFI helpers --------------------
void connectWiFi() {
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void sendDataToWebsite(String status) {
  if (!enableWebsiteSend) {
    Serial.println("Website sending disabled for now.");
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return;
  }

  if (!gps.location.isValid()) {
    Serial.println("GPS not valid yet. Skip telemetry send.");
    return;
  }

  float currentWeightKg = currentWeight / 1000.0;

  HTTPClient http;
  http.begin(serverName);
  http.addHeader("Content-Type", "application/json");
  if (String(esp32ApiKey).length() > 0) {
    http.addHeader("x-esp32-key", esp32ApiKey);
  }

  String jsonData = "{";
  jsonData += "\"vehicleId\":" + String(vehicleId) + ",";
  jsonData += "\"latitude\":" + String(gpsLat, 6) + ",";
  jsonData += "\"longitude\":" + String(gpsLng, 6) + ",";
  jsonData += "\"speedKmh\":" + String(gpsSpeed, 2) + ",";
  jsonData += "\"heading\":" + String(gpsHeading, 2) + ",";
  jsonData += "\"currentWeightKg\":" + String(currentWeightKg, 3) + ",";
  jsonData += "\"status\":\"" + status + "\"";
  jsonData += "}";

  int httpResponseCode = http.POST(jsonData);
  String responseBody = http.getString();

  Serial.print("HTTP Response: ");
  Serial.println(httpResponseCode);
  Serial.print("Response Body: ");
  Serial.println(responseBody);

  http.end();
}

// -------------------- setup --------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("Starting...");

  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("OLED not found at 0x3C");
    while (1);
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 20);
  display.println("OLED OK");
  display.display();
  delay(1200);

  LoadCell.begin();
  EEPROM.begin(512);

  float calibrationValue;
  EEPROM.get(calVal_eepromAdress, calibrationValue);

  Serial.print("Calibration: ");
  Serial.println(calibrationValue);

  if (calibrationValue == 0 || isnan(calibrationValue)) {
    clearBase();
    display.println("No calibration");
    display.display();
    while (1);
  }

  LoadCell.start(2000, true);

  if (LoadCell.getTareTimeoutFlag() || LoadCell.getSignalTimeoutFlag()) {
    clearBase();
    display.println("HX711 timeout");
    display.display();
    while (1);
  }

  LoadCell.setCalFactor(calibrationValue);

  // GPS start
  GPSserial.begin(9600, SERIAL_8N1, 19, 18);
  Serial.println("GPS test started...");
  Serial.println("Waiting for GPS signal...");

  // WIFI start
  connectWiFi();

  clearBase();
  display.println("Scale Ready");
  display.display();

  Serial.println("Setup complete");
}

// -------------------- loop --------------------
void loop() {
  // ---------------- GPS read ----------------
  while (GPSserial.available() > 0) {
    gps.encode(GPSserial.read());
  }

  if (gps.location.isUpdated()) {
    gpsLat = gps.location.lat();
    gpsLng = gps.location.lng();
    gpsSpeed = gps.speed.kmph();
    gpsHeading = gps.course.isValid() ? gps.course.deg() : 0.0;
    gpsSats = gps.satellites.value();
    gpsAltitude = gps.altitude.meters();

    printGPSData();
  }

  // Mock-like continuous telemetry stream (independent of event-based sends below).
  if (enableWebsiteSend && enableRealtimeStream) {
    unsigned long now = millis();
    if (now - lastRealtimeStreamSentAt >= realtimeStreamIntervalMs) {
      sendDataToWebsite("LIVE");
      lastRealtimeStreamSentAt = now;
    }
  }

  // ---------------- Load cell logic ----------------
  if (LoadCell.update()) {
    if (millis() - lastUpdate > 300) {
      currentWeight = LoadCell.getData();
      normalizeWeight();

      Serial.print("Weight: ");
      Serial.println(currentWeight, 1);

      switch (state) {
        case IDLE:
          if (currentWeight > detectThreshold) {
            detectedWeight = currentWeight;
            state = WAIT_CONFIRM_OBJECT;
            Serial.println("Weight detected.");
            printConfirmPrompt();
          }
          break;

        case WAIT_CONFIRM_OBJECT:
          if (currentWeight > detectThreshold) {
            detectedWeight = currentWeight;
          } else {
            Serial.println("Object removed before confirmation.");
            resetToIdle();
          }
          break;

        case ASK_ADD_ANOTHER:
          break;

        case WAIT_ADDITIONAL_OBJECT:
          if (currentWeight > confirmedWeight + changeThreshold) {
            detectedWeight = currentWeight;
            state = WAIT_CONFIRM_OBJECT;
            Serial.println("Additional object/weight detected.");
            printConfirmPrompt();
          }
          break;

        case MONITOR_CONFIRMED:
          if (currentWeight < confirmedWeight - changeThreshold) {
            removedWeight = confirmedWeight - currentWeight;
            state = CARGO_LOSS_STATE;

            Serial.print("CARGO LOSS! Missing weight: ");
            Serial.print(removedWeight, 1);
            Serial.println(" g");

            printGPSOnCargoLoss();
            sendDataToWebsite("CARGO LOSS");
          }
          else if (currentWeight > confirmedWeight + changeThreshold) {
            detectedWeight = currentWeight;
            state = WAIT_CONFIRM_OBJECT;
            Serial.println("Additional object/weight detected.");
            printConfirmPrompt();
          }
          break;

        case WAIT_REMOVE_ACTION:
          if (currentWeight < confirmedWeight - changeThreshold) {
            removedWeight = confirmedWeight - currentWeight;
            previousConfirmedWeight = confirmedWeight;
            state = WAIT_CONFIRM_REMOVAL;

            Serial.print("Removed weight detected: ");
            Serial.print(removedWeight, 1);
            Serial.println(" g");
            Serial.println("Confirm removed weight/object? y/n");
          }
          break;

        case WAIT_CONFIRM_REMOVAL:
          if (currentWeight < previousConfirmedWeight - changeThreshold) {
            removedWeight = previousConfirmedWeight - currentWeight;
          } else if (currentWeight >= previousConfirmedWeight - changeThreshold) {
            Serial.println("Removed object returned.");
            confirmedWeight = previousConfirmedWeight;
            removedWeight = 0.0;
            previousConfirmedWeight = 0.0;
            state = MONITOR_CONFIRMED;
          }
          break;

        case WAIT_RETURN_REMOVED_OBJECT:
          if (currentWeight >= previousConfirmedWeight - changeThreshold) {
            Serial.println("Removed object returned.");
            confirmedWeight = previousConfirmedWeight;
            removedWeight = 0.0;
            previousConfirmedWeight = 0.0;
            state = MONITOR_CONFIRMED;
          }
          break;

        case CARGO_LOSS_STATE:
          if (currentWeight >= confirmedWeight - changeThreshold) {
            Serial.println("Object/weight returned.");
            state = MONITOR_CONFIRMED;
          }
          break;
      }

      // ---------------- OLED by state ----------------
      switch (state) {
        case IDLE:
          showLiveWeight(currentWeight);
          break;

        case WAIT_CONFIRM_OBJECT:
          showConfirmObject(detectedWeight);
          break;

        case ASK_ADD_ANOTHER:
          showAddAnother(confirmedWeight);
          break;

        case WAIT_ADDITIONAL_OBJECT:
          showWaitingAdditional(confirmedWeight);
          break;

        case MONITOR_CONFIRMED:
          showProtectedTotal(confirmedWeight);
          break;

        case WAIT_REMOVE_ACTION:
          showRemoveNow(confirmedWeight);
          break;

        case WAIT_CONFIRM_REMOVAL:
          showConfirmRemoved(removedWeight, currentWeight);
          break;

        case WAIT_RETURN_REMOVED_OBJECT:
          showReturnRemovedObject(removedWeight);
          break;

        case CARGO_LOSS_STATE:
          showCargoLoss(removedWeight);
          break;
      }

      lastUpdate = millis();
    }
  }

  // ---------------- Serial input ----------------
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input == "y" || input == "Y" || input == "yes" || input == "YES" || input == "Yes") {

      if (state == WAIT_CONFIRM_OBJECT) {
        confirmedWeight = detectedWeight;

        Serial.print("Weight confirmed: ");
        Serial.print(confirmedWeight, 1);
        Serial.println(" g");

        state = ASK_ADD_ANOTHER;
        printAddAnotherPrompt();
        sendDataToWebsite("CONFIRMED");
      }
      else if (state == ASK_ADD_ANOTHER) {
        Serial.println("Place another object/weight now.");
        state = WAIT_ADDITIONAL_OBJECT;
      }
      else if (state == WAIT_CONFIRM_REMOVAL) {
        confirmedWeight = currentWeight;
        removedWeight = 0.0;
        previousConfirmedWeight = 0.0;

        Serial.print("Removal confirmed. New protected total: ");
        Serial.print(confirmedWeight, 1);
        Serial.println(" g");

        state = ASK_ADD_ANOTHER;
        printAddAnotherPrompt();
        sendDataToWebsite("REMOVED");
      }
    }

    else if (input == "n" || input == "N" || input == "no" || input == "NO" || input == "No") {

      if (state == WAIT_CONFIRM_OBJECT) {
        Serial.print("Weight/Object rejected: ");
        Serial.print(detectedWeight, 1);
        Serial.println(" g");

        showRejected(detectedWeight);
        delay(1200);

        Serial.println("Remove rejected object to continue.");
        state = IDLE;
        sendDataToWebsite("REJECTED");
      }
      else if (state == ASK_ADD_ANOTHER) {
        Serial.println("No additional object/weight.");
        printRemovePrompt();
        state = MONITOR_CONFIRMED;
      }
      else if (state == WAIT_CONFIRM_REMOVAL) {
        Serial.println("Removal rejected. Return removed object.");
        state = WAIT_RETURN_REMOVED_OBJECT;
      }
    }

    else if (input == "r" || input == "R" || input == "remove" || input == "REMOVE" || input == "Remove") {
      if (state == MONITOR_CONFIRMED) {
        Serial.println("Removal mode enabled.");
        Serial.println("Remove one object/weight now.");
        previousConfirmedWeight = confirmedWeight;
        state = WAIT_REMOVE_ACTION;
      }
    }

    else if (input == "t" || input == "T") {
      LoadCell.tareNoDelay();
      resetToIdle();
      Serial.println("Tare requested");
    }
  }

  if (LoadCell.getTareStatus() == true) {
    resetToIdle();
    Serial.println("Tare complete");
  }
}