# WeighGuard - Mobile App (Flutter)

Mobile frontend for WeighGuard - a real-time cargo weight monitoring and fleet management system. This Flutter app connects to the backend admin API to display live weight, GPS location, and cargo status to drivers and fleet managers.

## Features

### Driver App
- View current cargo weight on real-time display
- See cargo status: Normal, Overloaded, or Cargo Loss Detected
- Receive instant alerts for overloading and cargo loss
- View GPS location on map
- Review alert history
- Access trip history

### Admin App
- Monitor real-time weight and location from all vehicles
- View cargo loss and overloading incidents with GPS coordinates
- Manage drivers and vehicles
- View historical data and reports
- Analyze routes for frequent cargo loss incidents

## Prerequisites

- **Flutter SDK** (v3.0 or higher) - [Install Flutter](https://flutter.dev/docs/get-started/install)
- **Android SDK** or **Xcode** (for iOS)
- **Git**
- **Backend API** running (from admin website)

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd WeighGuard-Mobile
flutter pub get
```

### 2. Configure API Endpoint

Edit `lib/config/api_config.dart`:

```dart
class ApiConfig {
  static const String baseUrl = 'http://your-backend-url:3000'; // Admin API
  static const String wsUrl = 'ws://your-backend-url:3000';     // WebSocket
}
```

### 3. Run

```bash
flutter run
```

## Project Structure

```
lib/
├── main.dart
├── config/
│   └── api_config.dart
├── screens/
│   ├── auth/
│   │   ├── login_screen.dart
│   │   └── splash_screen.dart
│   ├── driver/
│   │   ├── home_screen.dart
│   │   ├── weight_display_screen.dart
│   │   ├── gps_map_screen.dart
│   │   ├── alert_history_screen.dart
│   │   └── trip_history_screen.dart
│   └── admin/
│       ├── dashboard_screen.dart
│       ├── fleet_monitoring_screen.dart
│       ├── incident_screen.dart
│       ├── weight_analytics_screen.dart
│       ├── user_management_screen.dart
│       └── reports_screen.dart
├── models/
│   ├── user_model.dart
│   ├── vehicle_model.dart
│   ├── weight_model.dart
│   ├── location_model.dart
│   ├── incident_model.dart
│   └── alert_model.dart
├── services/
│   ├── api_service.dart
│   ├── websocket_service.dart
│   ├── auth_service.dart
│   └── notification_service.dart
├── providers/
│   ├── auth_provider.dart
│   ├── weight_provider.dart
│   ├── fleet_provider.dart
│   └── incident_provider.dart
└── widgets/
    ├── weight_display_widget.dart
    ├── status_indicator_widget.dart
    ├── alert_card.dart
    └── map_widget.dart
```

## Development Status

### MVP (Current)
- [ ] Authentication (login/logout)
- [ ] Driver: Real-time weight display
- [ ] Driver: GPS map view
- [ ] Driver: Alert notifications
- [ ] Driver: Alert history
- [ ] Admin: Fleet monitoring dashboard
- [ ] Admin: Incident tracking
- [ ] Admin: Weight analytics
- [ ] WebSocket integration for real-time data

### Future Phases
- [ ] Offline support with sync
- [ ] Advanced analytics
- [ ] Multi-language support
- [ ] Push notifications

## API Integration

The mobile app consumes the backend API from the admin website:

### Key Endpoints Needed
- `POST /api/auth/login` - Driver/Admin login
- `GET /api/drivers/{id}` - Get driver info
- `GET /api/vehicles/{id}` - Get vehicle and weight data
- `GET /api/incidents` - Get incidents list
- `GET /api/locations/{id}` - Get GPS location
- `WebSocket /ws/tracking` - Real-time weight and location updates

### Data Models

**Weight:**
```
{
  vehicleId: string,
  weight: number,
  timestamp: datetime,
  status: "normal" | "overloaded" | "cargo_loss"
}
```

**Location:**
```
{
  vehicleId: string,
  latitude: number,
  longitude: number,
  timestamp: datetime
}
```

**Incident:**
```
{
  id: string,
  vehicleId: string,
  type: "overload" | "cargo_loss",
  weight: number,
  location: {latitude, longitude},
  timestamp: datetime
}
```

## Troubleshooting

### App won't start
- Run `flutter doctor` to check dependencies
- Ensure device/emulator is connected: `flutter devices`
- Clean build: `flutter clean && flutter pub get`

### Weight data not displaying
- Check API base URL in `api_config.dart`
- Verify backend API is running
- Check network connectivity
- Verify user has access to vehicle data

### Location not showing
- Check GPS permissions are granted
- Verify backend API is returning location data
- Ensure WebSocket connection is active

### Can't connect to backend
- Verify backend server is running on configured URL
- Check firewall allows connections
- Verify API endpoint is correct
- Check network connectivity

## Contributing

See the main [README.md](../README.md) for contribution guidelines.
