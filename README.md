# IOT WeighGuard

A comprehensive IoT fleet management system for real-time GPS tracking, incident monitoring, and administrative control of vehicle fleets equipped with weight monitoring sensors.

## Features

- **Real-time GPS Tracking**: WebSocket-based live tracking of fleet vehicles
- **Admin Dashboard**: Comprehensive admin panel for fleet management
- **Incident Management**: Track and manage incidents across your fleet
- **Driver Management**: Manage driver information and assignments
- **Location Tracking**: Real-time vehicle location monitoring
- **Fleet Management**: Overview and control of entire fleet operations
- **User Management**: Admin user account and permission management
- **Reports**: Generate reports on fleet activities and incidents
- **Admin Settings**: Configurable system settings
- **Hardware Integration**: Arduino GPS module integration for vehicle tracking

## Prerequisites

Before you begin, make sure you have the following installed on your system:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **PostgreSQL** (v12 or higher) - [Download here](https://www.postgresql.org/download/)

## Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd IOT-weighGuard
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages:
- **express**: Web framework
- **ejs**: Template engine for views
- **pg**: PostgreSQL client
- **body-parser**: Middleware for parsing request bodies
- **dotenv**: Environment variable management
- **bcrypt**: Password hashing for security
- **ws**: WebSocket library for real-time tracking

### 3. Set Up PostgreSQL Database

1. Open PostgreSQL command line or pgAdmin
2. Create a new database:
   ```sql
   CREATE DATABASE weighguard;
   ```

3. You may need to set up tables. Check if there's a `schema.sql` file and run it:
   ```bash
   psql -U postgres -d weighguard -f schema.sql
   ```

## Environment Variables Setup

Create a `.env` file in the root directory of your project and add the following variables:

```env
# Server Port
PORT=3000

# PostgreSQL Database Configuration
DB_USER=postgres
DB_HOST=localhost
DB_NAME=weighguard
DB_PASSWORD=your_password_here
DB_PORT=5432

# Optional: Uncomment if using managed database with SSL
# DB_SSL=true
```

**Important**: 
- Replace `your_password_here` with your actual PostgreSQL password
- Never commit `.env` file to GitHub (it contains sensitive data)
- Add `.env` to your `.gitignore` file

## Running the Application

### Development Mode

```bash
npm start
```

Or if you want to use nodemon for auto-restart on changes:

```bash
npm install --save-dev nodemon
npx nodemon app.js
```

The application will start at `http://localhost:3000`

### Access Points

- **Admin Dashboard**: `http://localhost:3000/admin`
- **Admin Login**: `http://localhost:3000/auth/admin-login`
- **API Endpoints**:
  - Drivers: `/api/drivers`
  - Incidents: `/api/incidents`
  - Locations: `/api/locations`

## Architecture & Project Structure

```
IOT-weighGuard/
├── app.js                          # Main application entry point
├── package.json                    # Dependencies and scripts
├── .env                           # Environment variables (not in repo)
├── src/
│   ├── controller/                # Route controllers
│   │   ├── admin/                 # Admin dashboard controllers
│   │   │   ├── adminDashboardController.js
│   │   │   ├── adminFleetController.js
│   │   │   ├── adminIncidentsController.js
│   │   │   ├── adminReportController.js
│   │   │   ├── adminSettingsController.js
│   │   │   └── adminUserController.js
│   │   └── api/                   # API controllers
│   │       ├── driverController.js
│   │       ├── incidentController.js
│   │       └── locationController.js
│   ├── database/
│   │   └── db.js                  # PostgreSQL connection pool
│   ├── middleware/                # Express middleware
│   ├── models/                    # Database models
│   ├── routes/                    # Route definitions
│   │   ├── admin/
│   │   └── api/
│   ├── utils/
│   │   └── arduino_gps_example.ino  # Arduino GPS module code
│   ├── public/                    # Static files
│   │   ├── css/                   # Stylesheets
│   │   ├── js/                    # Client-side JavaScript
│   │   └── uploads/               # User uploads
│   └── views/                     # EJS templates
│       ├── admin/                 # Admin pages
│       ├── auth/                  # Authentication pages
│       └── partials/              # Reusable template components
```

## Key Features Explained

### Real-time GPS Tracking
- WebSocket connection at `/ws/tracking`
- Receives live GPS data from IoT devices
- Broadcasts location updates to connected clients

### Admin Dashboard
- View fleet statistics and status
- Manage drivers and vehicles
- Monitor incidents in real-time
- Generate and view reports
- Configure system settings

### Database
- PostgreSQL-based persistent storage
- Connection pooling for efficient database access
- Supports SSL for managed databases (optional)

## Hardware Setup

If you have Arduino GPS modules:
- Check `src/utils/arduino_gps_example.ino` for the Arduino code
- Upload the code to your Arduino board
- Configure the Arduino to send data to your server's WebSocket endpoint

## Troubleshooting

### Application won't start
- Ensure Node.js and npm are installed: `node --version` and `npm --version`
- Check that all dependencies are installed: `npm install`
- Verify PORT 3000 is not in use

### Database connection fails
- Ensure PostgreSQL is running
- Check `.env` file has correct database credentials
- Verify the database `weighguard` exists
- Test connection with: `psql -U postgres -d weighguard -c "SELECT 1"`

### WebSocket connection issues
- Ensure your firewall allows WebSocket connections
- Check browser console for connection errors
- Verify the server is running on the correct port

## Contributing

We welcome contributions to IOT WeighGuard! Here's how you can help:

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/IOT-weighGuard.git
   cd IOT-weighGuard
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Contributing to Admin Features

The admin section is a critical part of the application. When contributing to admin functionality:

#### Admin File Structure
Admin-related files are organized as follows:
- **Controllers**: `src/controller/admin/admin*Controller.js`
- **Routes**: `src/routes/admin/adminRoutes.js`
- **Views (EJS Templates)**: `src/views/admin/*.ejs`
- **Styles**: `src/public/css/admin/admin*.css`
- **Client-side JS**: `src/public/js/admin/admin*.js`

#### Adding New Admin Features

1. **Create a new controller** in `src/controller/admin/` (e.g., `adminNewFeatureController.js`)
   ```javascript
   export const getNewFeature = (req, res) => {
       // Your logic here
   };
   
   export const postNewFeature = (req, res) => {
       // Your logic here
   };
   ```

2. **Add routes** in `src/routes/admin/adminRoutes.js`:
   ```javascript
   import { getNewFeature, postNewFeature } from "../../controller/admin/adminNewFeatureController.js";
   
   router.get('/new-feature', getNewFeature);
   router.post('/new-feature', postNewFeature);
   ```

3. **Create EJS template** in `src/views/admin/adminNewFeature.ejs`
   - Use the header/sidebar partial: `<%- include('../partials/adminHeaderSidebar') %>`
   - Follow existing styling conventions

4. **Add styles** in `src/public/css/admin/adminNewFeature.css`

5. **Add client-side logic** in `src/public/js/admin/adminNewFeature.js` if needed

#### Code Style Guidelines

- **JavaScript**: Use ES6+ syntax (imports/exports)
- **Naming**: Use camelCase for functions and variables
- **Controllers**: Follow RESTful conventions (get/post/put/delete)
- **Environment Variables**: Use `process.env.VARIABLE_NAME` for sensitive data
- **Database Queries**: Always use parameterized queries to prevent SQL injection
- **Comments**: Add comments for complex logic

#### Testing Before Submission

1. Test your changes locally:
   ```bash
   npm install  # if dependencies changed
   npm start
   ```
2. Verify the feature works in all browsers (Chrome, Firefox, Safari, Edge)
3. Check responsive design on mobile devices
4. Test error handling and edge cases
5. Ensure no console errors or warnings

### Commit Guidelines

Write clear, descriptive commit messages:
```bash
git commit -m "Add admin incident export feature"
git commit -m "Fix admin dashboard loading bug"
git commit -m "Improve admin user search performance"
```

### Submitting Changes

1. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** with:
   - Clear title describing the changes
   - Description of what was added/fixed
   - List of any new dependencies (if applicable)
   - Screenshots for UI changes
   - Notes on testing performed

3. **Wait for review** - maintainers will review and may request changes

### Pull Request Template

When submitting a PR, please include:

```
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Enhancement
- [ ] Admin-related

## How Has This Been Tested?
Describe the testing steps:
1. 
2. 
3. 

## Admin-Specific Checklist (if applicable)
- [ ] Only admin users can access this feature
- [ ] No unauthorized data is exposed
- [ ] Works on admin dashboard
- [ ] Follows existing admin UI patterns
- [ ] Mobile responsive

## Screenshots (if UI changes)
[Add screenshots here]
```

### Questions?

If you have questions about contributing:
1. Check existing issues for similar discussions
2. Create a new GitHub issue with your question
3. Join our discussions/community chat

Thank you for contributing to IOT WeighGuard!

## License

ISC

## Support

For issues or questions, please create an issue in the GitHub repository.
