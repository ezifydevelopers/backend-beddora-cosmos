# PowerShell script to create .env file for backend
# Run this script: .\create-env.ps1

$envContent = @"
# Server Configuration
NODE_ENV=development
PORT=5200
API_PREFIX=/api

# Database
# Update with your PostgreSQL credentials
# Format: postgresql://username:password@localhost:5432/beddoracosmos
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/beddoracosmos

# JWT Authentication
# Generate secure random strings for production
# You can use: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret-change-this-in-production-min-32-chars
JWT_REFRESH_EXPIRES_IN=30d

# CORS - Frontend URL
CORS_ORIGIN=http://localhost:5100

# Email Configuration (SMTP)
# For Gmail, use App Password: https://support.google.com/accounts/answer/185833
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@beddora.com

# Amazon SP API Configuration
# Get these from Amazon Seller Central > Apps & Services > Develop Apps
AMAZON_SP_API_CLIENT_ID=your-amazon-sp-api-client-id
AMAZON_SP_API_CLIENT_SECRET=your-amazon-sp-api-client-secret
AMAZON_SP_API_REFRESH_TOKEN=your-amazon-sp-api-refresh-token
AMAZON_SP_API_REGION=us-east-1

# Logging
LOG_LEVEL=info
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8 -NoNewline
Write-Host "✅ Backend .env file created successfully!" -ForegroundColor Green
Write-Host "⚠️  Please update DATABASE_URL with your PostgreSQL credentials" -ForegroundColor Yellow

