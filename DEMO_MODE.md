# Demo Mode

Demo mode provides a read-only version of HarborGuard for demonstration purposes. When enabled, all write operations (POST, PUT, DELETE, PATCH) to API endpoints are blocked, while read operations (GET) continue to work normally.

## Usage

Set the environment variable `DEMO_MODE=true` to enable demo mode:

```bash
# Enable demo mode
export DEMO_MODE=true

# Start the application
npm start
```

Or with Docker:

```bash
docker run -e DEMO_MODE=true harborguard
```

## Features

### Blocked Operations
When demo mode is active, the following HTTP methods are blocked for all `/api/*` endpoints:
- `POST` - Creating new resources
- `PUT` - Updating existing resources  
- `DELETE` - Deleting resources
- `PATCH` - Partial updates

### Allowed Operations
These operations continue to work normally:
- `GET` - Reading data
- `HEAD` - Header information
- `OPTIONS` - CORS preflight requests

### Visual Indicator
When demo mode is enabled, a "Demo Mode" badge appears in the application header to clearly indicate the current state.

## API Response

Blocked requests receive a 403 Forbidden response with details:

```json
{
  "error": "Demo mode is enabled. Write operations are not allowed.",
  "message": "This is a read-only demo environment. POST, PUT, DELETE, and PATCH requests are blocked.",
  "allowedMethods": ["GET", "HEAD", "OPTIONS"]
}
```

## Use Cases

- **Live Demos**: Show application functionality without allowing modifications
- **Public Deployments**: Provide safe public access to explore the interface
- **Training**: Allow users to explore without risk of data changes
- **Development**: Test read-only scenarios

## Configuration

Demo mode is controlled by a single environment variable:

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `DEMO_MODE` | `true`/`false` | `false` | Enables read-only demo mode |

## Testing

A test script is provided to verify demo mode functionality:

```bash
node test-demo-mode.js
```

Manual testing:
```bash
# Should be blocked (403 Forbidden)
curl -X POST http://localhost:3000/api/scans

# Should work normally  
curl -X GET http://localhost:3000/api/scans
```