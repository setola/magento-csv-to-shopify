# Web Downloader Feature

This feature adds web authentication and CSV file download capabilities to the Shopify Importer project.

## Files Added

- `utils/WebAuthenticator.js` - Utility class for web authentication and cookie management
- `web-download.js` - Main script for the web download workflow
- `.env.example` - Example environment configuration file

## Features

### WebAuthenticator Class

The `WebAuthenticator` class provides:

- **Login functionality**: Authenticate with username/password
- **Cookie management**: Automatically extract and store cookies (including PHPSESSID)
- **Authenticated requests**: Make GET requests with stored cookies
- **File downloads**: Download files from authenticated URLs
- **Session persistence**: Maintain authentication state throughout the process

### Main Script (web-download.js)

The main script orchestrates the complete workflow:

1. **Configuration validation**: Checks for required environment variables
2. **Authentication**: Logs into the target website
3. **Cookie extraction**: Saves PHPSESSID and other cookies
4. **File download**: Downloads CSV file using authenticated session
5. **Error handling**: Comprehensive error handling and logging

## Usage

### 1. Configuration

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
LOGIN_URL=https://your-website.com/login
DOWNLOAD_URL=https://your-website.com/export/csv
WEB_USERNAME=your_username
WEB_PASSWORD=your_password
OUTPUT_DIR=./data
DOWNLOAD_FILENAME=exported_data.csv
```

### 2. Running the Script

```bash
# Using npm script
npm run web-download

# Or directly with node
node web-download.js
```

### 3. Docker Usage

Add to your Taskfile.yml:

```yaml
web-download:
  desc: Download CSV file from authenticated web source
  cmds:
    - docker run --rm -v $(PWD):/app -w /app --env-file .env node:18 node web-download.js
```

## Configuration Options

| Environment Variable | Description | Required | Default |
|---------------------|-------------|----------|---------|
| `LOGIN_URL` | URL for authentication endpoint | Yes | - |
| `DOWNLOAD_URL` | URL to download CSV file from | Yes | - |
| `WEB_USERNAME` | Username for authentication | Yes | - |
| `WEB_PASSWORD` | Password for authentication | Yes | - |
| `OUTPUT_DIR` | Directory to save downloaded files | No | `./data` |
| `DOWNLOAD_FILENAME` | Base filename for downloaded file | No | `downloaded_file.csv` |
| `LOGIN_FORM_FIELD1` | Form field name for username | No | `username` |
| `LOGIN_FORM_FIELD2` | Form field name for password | No | `password` |

## Technical Details

### Form Field Customization

The script supports custom form field names for different login forms:
- `LOGIN_FORM_FIELD1`: Defines the username field name (default: `username`)
- `LOGIN_FORM_FIELD2`: Defines the password field name (default: `password`)
- Additional form fields can be added as needed

Example for different login forms:
```env
# Standard form
LOGIN_FORM_FIELD1=username
LOGIN_FORM_FIELD2=password

# Custom form with different field names
LOGIN_FORM_FIELD1=email
LOGIN_FORM_FIELD2=passwd

# Form with additional fields
LOGIN_FORM_FIELD1=user
LOGIN_FORM_FIELD2=pass
LOGIN_FORM_FIELD3=csrf_token
```

### Cookie Handling

The script automatically:
- Extracts cookies from login response headers
- Stores PHPSESSID and other session cookies
- Includes cookies in subsequent authenticated requests
- Provides methods to access specific cookies

### File Downloads

Downloaded files are saved with timestamps to prevent overwrites:
- Format: `filename_YYYY-MM-DDTHH-mm-ss.csv`
- Saved to the configured output directory
- Automatic directory creation if needed

### Error Handling

Comprehensive error handling includes:
- Configuration validation
- Network request failures
- Authentication failures
- File system errors
- Detailed logging for debugging

### Logging

Uses the existing Logger utility for consistent logging:
- Console output with colors
- File logging with timestamps
- Different log levels (DEBUG, INFO, WARN, ERROR, SUCCESS)

## Example Workflow

1. Script starts and validates configuration
2. Makes POST request to login URL with credentials
3. Extracts PHPSESSID cookie from response
4. Makes authenticated GET request to download URL
5. Downloads CSV file to data directory
6. Logs success/failure status

## Integration with Existing Project

The new feature integrates seamlessly with the existing project:
- Uses existing Logger utility
- Follows project coding standards
- Uses ES6 modules and async/await
- Maintains consistent error handling patterns
- Added to package.json scripts
