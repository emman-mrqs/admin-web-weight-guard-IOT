/**
 * WeighGuard GPS Tracker - ESP32/ESP8266 Example
 * 
 * This sketch reads GPS coordinates from a GPS module and sends them
 * to your WeighGuard server via HTTP POST.
 * 
 * Hardware:
 * - ESP32 or ESP8266 board
 * - GPS Module (Neo-6M, Neo-7M, or similar)
 * 
 * Wiring (ESP32):
 * - GPS TX → ESP32 GPIO 16 (RX2)
 * - GPS RX → ESP32 GPIO 17 (TX2)
 * - GPS VCC → 3.3V or 5V
 * - GPS GND → GND
 * 
 * Libraries needed:
 * - TinyGPS++ (by Mikal Hart)
 * - WiFi (built-in for ESP32)
 * - HTTPClient (built-in for ESP32)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPS++.h>

// ===========================================
// CONFIGURATION - EDIT THESE VALUES
// ===========================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://YOUR_SERVER_IP:3000/api/location";

// User ID assigned to this GPS device (matches user_id in database)
const int USER_ID = 1;

// Optional: Assignment ID if tracking a specific trip
// Set to 0 if no active assignment
int assignmentId = 0;

// Update interval in milliseconds (3000 = 3 seconds)
const unsigned long UPDATE_INTERVAL = 3000;

// ===========================================
// GPS SETUP
// ===========================================
TinyGPSPlus gps;
HardwareSerial gpsSerial(2); // Use Serial2 for GPS

unsigned long lastUpdateTime = 0;

void setup() {
    Serial.begin(115200);
    
    // Initialize GPS serial (9600 baud is default for most GPS modules)
    gpsSerial.begin(9600, SERIAL_8N1, 16, 17); // RX=16, TX=17
    
    Serial.println("\n=================================");
    Serial.println("WeighGuard GPS Tracker Starting...");
    Serial.println("=================================\n");
    
    // Connect to WiFi
    connectWiFi();
}

void loop() {
    // Read GPS data
    while (gpsSerial.available() > 0) {
        gps.encode(gpsSerial.read());
    }
    
    // Check if it's time to send an update
    if (millis() - lastUpdateTime >= UPDATE_INTERVAL) {
        lastUpdateTime = millis();
        
        // Ensure WiFi is connected
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("WiFi disconnected, reconnecting...");
            connectWiFi();
        }
        
        // Send location if GPS has valid fix
        if (gps.location.isValid()) {
            sendLocation();
        } else {
            Serial.println("Waiting for GPS fix...");
            Serial.print("Satellites: ");
            Serial.println(gps.satellites.value());
        }
    }
}

void connectWiFi() {
    Serial.print("Connecting to WiFi");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi Connected!");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\nFailed to connect to WiFi!");
    }
}

void sendLocation() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi not connected, skipping...");
        return;
    }
    
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    
    // Build JSON payload
    String jsonPayload = "{";
    jsonPayload += "\"userId\":" + String(USER_ID) + ",";
    jsonPayload += "\"latitude\":" + String(gps.location.lat(), 6) + ",";
    jsonPayload += "\"longitude\":" + String(gps.location.lng(), 6);
    
    // Add optional fields if available
    if (gps.speed.isValid()) {
        // Convert from knots to km/h
        jsonPayload += ",\"speed\":" + String(gps.speed.kmph(), 2);
    }
    
    if (gps.course.isValid()) {
        jsonPayload += ",\"heading\":" + String(gps.course.deg(), 2);
    }
    
    if (gps.hdop.isValid()) {
        // HDOP as accuracy estimate (lower is better)
        jsonPayload += ",\"accuracy\":" + String(gps.hdop.hdop(), 2);
    }
    
    // Add assignment ID if set
    if (assignmentId > 0) {
        jsonPayload += ",\"assignmentId\":" + String(assignmentId);
    }
    
    jsonPayload += "}";
    
    Serial.println("Sending location:");
    Serial.println(jsonPayload);
    
    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.print("Response (");
        Serial.print(httpResponseCode);
        Serial.print("): ");
        Serial.println(response);
    } else {
        Serial.print("Error sending location: ");
        Serial.println(httpResponseCode);
    }
    
    http.end();
}

/**
 * TESTING WITHOUT GPS HARDWARE
 * 
 * If you want to test the system without actual GPS hardware,
 * you can simulate GPS data. Replace the loop() function with this:
 */
/*
void loop() {
    if (millis() - lastUpdateTime >= UPDATE_INTERVAL) {
        lastUpdateTime = millis();
        
        if (WiFi.status() != WL_CONNECTED) {
            connectWiFi();
        }
        
        // Simulate movement - small random changes to coordinates
        static float testLat = 14.5995;  // Manila, Philippines
        static float testLng = 120.9842;
        
        testLat += random(-100, 100) / 100000.0;
        testLng += random(-100, 100) / 100000.0;
        
        sendTestLocation(testLat, testLng, random(0, 80), random(0, 360));
    }
}

void sendTestLocation(float lat, float lng, float speed, float heading) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    
    String jsonPayload = "{";
    jsonPayload += "\"userId\":" + String(USER_ID) + ",";
    jsonPayload += "\"latitude\":" + String(lat, 6) + ",";
    jsonPayload += "\"longitude\":" + String(lng, 6) + ",";
    jsonPayload += "\"speed\":" + String(speed, 2) + ",";
    jsonPayload += "\"heading\":" + String(heading, 2);
    if (assignmentId > 0) {
        jsonPayload += ",\"assignmentId\":" + String(assignmentId);
    }
    jsonPayload += "}";
    
    Serial.println("Sending test location:");
    Serial.println(jsonPayload);
    
    int httpResponseCode = http.POST(jsonPayload);
    Serial.print("Response: ");
    Serial.println(httpResponseCode);
    
    http.end();
}
*/
