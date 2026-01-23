# Beddora Backend

A production-ready modular monolith backend for Beddora SaaS application built with Node.js, Express, TypeScript, PostgreSQL, Prisma, and BullMQ. Features comprehensive Amazon SP-API integration with OAuth, webhooks, background job processing, and multi-seller isolation.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis (optional, but recommended for production)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run prisma:migrate

# Seed database (optional)
npm run prisma:seed

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📁 Project Structure

```
backend-beddora-cosmos/
├── src/
│   ├── server.ts            # Entry point
│   ├── app.ts               # Express app setup
│   ├── routes.ts            # Central route registration
│   │
│   ├── config/              # Configuration files
│   │   ├── env.ts          # Environment variables
│   │   ├── db.ts           # Prisma client
│   │   ├── mail.ts         # Email configuration
│   │   └── logger.ts       # Winston logger
│   │
│   ├── modules/            # Feature-based modules
│   │   ├── auth/          # Authentication (full implementation)
│   │   ├── users/         # User management
│   │   ├── accounts/      # Internal account management
│   │   ├── marketplaces/  # Marketplace data
│   │   ├── profit/        # Profit calculations and analytics
│   │   ├── inventory/     # Inventory management
│   │   ├── expenses/      # Expense tracking
│   │   ├── cashflow/      # Cashflow tracking
│   │   ├── ppc/           # PPC campaign management
│   │   ├── alerts/        # Alerts and notifications
│   │   ├── autoresponder/ # Automated email responses
│   │   ├── reimbursements/# Amazon reimbursements
│   │   ├── reports/       # Report generation
│   │   ├── admin/         # Admin operations
│   │   └── amazon/        # Amazon SP-API integration (comprehensive)
│   │       ├── Core Services
│   │       │   ├── sp-api-wrapper.service.ts  # SP-API client wrapper
│   │       │   ├── sp-api.client.ts           # Low-level HTTP client
│   │       │   ├── account.service.ts           # Account CRUD & encryption
│   │       │   ├── token.service.ts             # LWA token management
│   │       │   ├── iam.service.ts               # AWS IAM role assumption
│   │       │   ├── oauth.service.ts             # OAuth 2.0 flow
│   │       │   └── sync.service.ts              # Data synchronization
│   │       ├── API Clients
│   │       │   ├── orders-api.service.ts       # Orders API
│   │       │   ├── finances-api.service.ts     # Finances API
│   │       │   ├── reports-api.service.ts      # Reports API
│   │       │   ├── products-api.service.ts     # Products API
│   │       │   └── inventory-api.service.ts   # Inventory API
│   │       ├── Controllers
│   │       │   ├── amazon.controller.ts        # Main controller
│   │       │   ├── oauth.controller.ts         # OAuth endpoints
│   │       │   ├── products.controller.ts      # Products endpoints
│   │       │   ├── inventory.controller.ts    # Inventory endpoints
│   │       │   ├── sync-status.controller.ts  # Sync status endpoints
│   │       │   ├── sync-schedule.controller.ts # Sync scheduling
│   │       │   └── error-recovery.controller.ts # Error recovery
│   │       ├── Webhooks
│   │       │   └── webhooks.ts                 # Webhook handlers
│   │       ├── Transformers
│   │       │   ├── common.transformer.ts       # Common utilities
│   │       │   ├── money.transformer.ts        # Money transformations
│   │       │   ├── order.transformer.ts        # Order transformations
│   │       │   ├── fee.transformer.ts          # Fee transformations
│   │       │   ├── inventory.transformer.ts    # Inventory transformations
│   │       │   ├── product.transformer.ts      # Product transformations
│   │       │   ├── ppc.transformer.ts          # PPC transformations
│   │       │   └── listing.transformer.ts      # Listing transformations
│   │       └── Routes & Validation
│   │           ├── amazon.routes.ts             # All routes
│   │           └── amazon.validation.ts        # Request validation
│   │
│   ├── config/              # Configuration files
│   │   ├── env.ts          # Environment variables
│   │   ├── db.ts           # Prisma client
│   │   ├── mail.ts         # Email configuration
│   │   ├── logger.ts       # Winston logger
│   │   ├── redis.ts        # Redis client
│   │   ├── queue.ts        # BullMQ configuration
│   │   └── startup-validation.ts # Startup checks
│   │
│   ├── middlewares/         # Express middlewares
│   │   ├── auth.middleware.ts    # JWT authentication
│   │   ├── role.middleware.ts    # Role-based access control
│   │   ├── error.middleware.ts   # Error handling
│   │   ├── validation.middleware.ts # Request validation
│   │   ├── rateLimiter.ts        # Rate limiting
│   │   └── sanitize.middleware.ts # Request/response sanitization
│   │
│   ├── jobs/               # Background job system (BullMQ)
│   │   ├── queue.ts        # Queue configuration
│   │   ├── workers.ts       # Worker initialization
│   │   ├── processors/     # Job processors
│   │   │   ├── data-sync.processor.ts
│   │   │   ├── manual-sync.processor.ts
│   │   │   ├── reports.processor.ts
│   │   │   └── alerts.processor.ts
│   │   ├── schedulers/     # Job schedulers
│   │   │   ├── data-sync.scheduler.ts
│   │   │   ├── reports.scheduler.ts
│   │   │   └── alerts.scheduler.ts
│   │   └── error-recovery.service.ts # Error recovery
│   │
│   └── utils/              # Utility functions
│       ├── encryption.ts   # AES-256-CBC encryption
│       ├── redis.service.ts # Redis wrapper with fallback
│       ├── security.utils.ts # Webhook verification, sanitization
│       ├── audit.service.ts # Audit logging
│       ├── date.ts
│       └── currency.ts
│
├── prisma/                 # Prisma ORM
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # Database migrations
│   └── seed.ts            # Database seeding
│
└── tests/                  # Tests (to be implemented)
```

## 🏗️ Architecture

### Modular Monolith

The backend follows a **modular monolith** architecture:

- **Each module is self-contained** with its own controller, service, and routes
- **Services contain business logic**, controllers only handle HTTP layer
- **Easy to extract** modules into microservices later
- **Shared utilities** and middlewares for common functionality

### Module Structure

Each module follows this structure:

```
module-name/
├── module-name.controller.ts  # HTTP request/response handling
├── module-name.service.ts     # Business logic
├── module-name.routes.ts      # Route definitions
└── module-name.validation.ts  # Input validation (optional)
```

### Separation of Concerns

- **Controllers**: Handle HTTP requests/responses, call services
- **Services**: Contain all business logic, database operations
- **Routes**: Define endpoints, apply middlewares
- **Middlewares**: Authentication, authorization, error handling

## 🔐 Authentication

JWT-based authentication is implemented in the `auth` module:

- **Registration**: `POST /api/auth/register`
- **Login**: `POST /api/auth/login`
- **Password Reset**: `POST /api/auth/password-reset/request`
- **Get Current User**: `GET /api/auth/me` (protected)

### Using Authentication

```typescript
import { authenticate } from '@/middlewares/auth.middleware'
import { requireRole } from '@/middlewares/role.middleware'

// Protected route
router.get('/protected', authenticate, controller.handler)

// Admin-only route
router.get('/admin', authenticate, requireRole('admin'), controller.handler)
```

## 📊 Database Schema

The Prisma schema includes models for:

### Core Models
- **Auth**: User, Role, UserRole
- **Accounts**: Account, Marketplace
- **Products**: Product, Inventory, Supplier, PurchaseOrder
- **Orders**: Order, OrderItem, Fee, Refund
- **PPC**: PPC_Campaign
- **Financial**: Expense, Cashflow
- **System**: Alert, Reimbursement, Report, AuditLog

### Amazon SP-API Models
- **AmazonAccount**: Stores encrypted SP-API credentials per seller
- **AmazonOrder**: Synced orders from SP-API
- **AmazonOrderItem**: Detailed order item information
- **AmazonInventory**: FBA inventory levels
- **AmazonRefund**: Refund and return data
- **OAuthState**: OAuth CSRF protection state
- **SyncSchedule**: Per-account sync configuration
- **SyncLog**: Sync execution history and statistics

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/password-reset/request` - Request password reset
- `POST /api/auth/password-reset` - Reset password
- `GET /api/auth/me` - Get current user (protected)

### Accounts
- `GET /api/accounts` - Get user accounts
- `POST /api/accounts` - Create account
- `GET /api/accounts/:id` - Get account by ID
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account

### Profit
- `GET /api/profit/report` - Get profit report
- `GET /api/profit/trends` - Get profit trends
- `GET /api/profit/summary` - Get profit summary

### Amazon SP-API Integration

#### OAuth & Account Management
- `GET /api/amazon/oauth/authorize` - Generate OAuth authorization URL
- `GET /api/amazon/oauth/callback` - Handle OAuth callback
- `GET /api/amazon/oauth/status` - Get OAuth status

#### Data Synchronization
- `POST /api/amazon/sync-orders` - Sync orders
- `POST /api/amazon/sync-fees` - Sync fees
- `POST /api/amazon/sync-ppc` - Sync PPC campaigns
- `POST /api/amazon/sync-inventory` - Sync inventory
- `POST /api/amazon/sync-listings` - Sync listing changes
- `POST /api/amazon/sync-refunds` - Sync refunds
- `GET /api/amazon/sync-logs` - Get sync history

#### Manual Sync & Status
- `POST /api/amazon/sync/trigger` - Trigger manual sync job
- `GET /api/amazon/sync/status/:jobId` - Get sync job status
- `GET /api/amazon/sync/status` - Get account sync status
- `GET /api/amazon/sync/queue-stats` - Get queue statistics
- `DELETE /api/amazon/sync/cancel/:jobId` - Cancel sync job

#### Sync Scheduling
- `GET /api/amazon/sync-schedule/:amazonAccountId` - Get sync schedule
- `PUT /api/amazon/sync-schedule/:amazonAccountId/:syncType` - Update sync schedule
- `PUT /api/amazon/sync-schedule/:amazonAccountId` - Update multiple schedules

#### Products API
- `GET /api/amazon/products/catalog` - Get catalog items by ASINs
- `GET /api/amazon/products/search` - Search catalog items
- `GET /api/amazon/products/pricing` - Get product pricing
- `GET /api/amazon/products/eligibility` - Check product eligibility
- `POST /api/amazon/products/parse` - Parse product data

#### Inventory API
- `GET /api/amazon/inventory/summaries` - Get inventory summaries
- `GET /api/amazon/inventory/items` - Get detailed inventory items
- `GET /api/amazon/inventory/health` - Get inventory health metrics
- `GET /api/amazon/inventory/sku/:sku` - Get inventory by SKU
- `POST /api/amazon/inventory/parse` - Parse inventory summary

#### Error Recovery
- `POST /api/amazon/error-recovery/retry/:jobId` - Retry failed job
- `GET /api/amazon/error-recovery/retryable` - Get retryable jobs
- `GET /api/amazon/error-recovery/permanent` - Get permanently failed jobs
- `POST /api/amazon/error-recovery/bulk-retry` - Bulk retry jobs
- `GET /api/amazon/error-recovery/statistics` - Get retry statistics
- `POST /api/amazon/error-recovery/classify-error` - Classify error

#### Webhooks (No authentication required)
- `POST /api/amazon/webhooks/orders` - Order notifications
- `POST /api/amazon/webhooks/inventory` - Inventory notifications
- `POST /api/amazon/webhooks/listings` - Listing change notifications
- `POST /api/amazon/webhooks/token-rotation` - Token rotation notifications

#### Testing
- `GET /api/amazon/test/orders` - Test orders API
- `GET /api/amazon/test/status` - Test credential status
- `GET /api/amazon/sandbox/orders` - Get sandbox orders
- `GET /api/amazon/sandbox/test` - Test sandbox connection

## 🔄 Background Job System (BullMQ)

The backend uses **BullMQ** for scalable background job processing with Redis:

### Job Queues
- **DATA_SYNC**: Data synchronization jobs (orders, fees, inventory, etc.)
- **REPORTS**: Report generation jobs
- **ALERTS**: Alert checking and creation jobs
- **MANUAL_SYNC**: Manual sync trigger jobs

### Job Processors
- `data-sync.processor.ts` - Processes data sync jobs with per-account scheduling
- `manual-sync.processor.ts` - Processes manual sync triggers
- `reports.processor.ts` - Generates scheduled reports
- `alerts.processor.ts` - Checks alert conditions

### Schedulers
- **Data Sync Scheduler**: Checks sync schedules every 15 minutes, dispatches jobs for accounts due for sync
- **Reports Scheduler**: Runs daily at 2 AM
- **Alerts Scheduler**: Runs every 15 minutes

### Features
- ✅ Automatic retry with exponential backoff
- ✅ Error classification and recovery
- ✅ Dead letter queue for permanent failures
- ✅ Job status tracking and monitoring
- ✅ Per-account sync scheduling
- ✅ Graceful degradation (works without Redis using in-memory fallback)

## 🛠️ Development

### Adding a New Module

1. Create module folder: `src/modules/your-module/`
2. Create files:
   - `your-module.controller.ts`
   - `your-module.service.ts`
   - `your-module.routes.ts`
3. Register routes in `src/routes.ts`

### Adding Business Logic

- **All business logic goes in services** (`*.service.ts`)
- **Controllers only call services** and handle HTTP
- **Use Prisma client** for database operations
- **Throw AppError** for operational errors

### Testing

```bash
# Run tests (to be implemented)
npm test
```

## 🏗️ Amazon SP-API Integration

### Architecture
The Amazon SP-API integration follows a **layered architecture**:

1. **Authentication Layer**: OAuth 2.0 flow, token management, IAM role assumption
2. **API Client Layer**: SP-API wrapper with automatic retry, rate limiting, request signing
3. **Service Layer**: Business logic for syncing orders, fees, inventory, products, etc.
4. **Data Layer**: Transformers for converting SP-API responses to internal format
5. **Webhook Layer**: Real-time notification handling from Amazon

### Key Features
- ✅ **OAuth 2.0 Authorization Flow**: Complete implementation with CSRF protection
- ✅ **Token Rotation**: Automatic handling of refresh token updates
- ✅ **Multi-Seller Isolation**: Strict data isolation per user/seller
- ✅ **Webhook Support**: Real-time notifications for orders, inventory, listings, token rotation
- ✅ **Background Sync**: BullMQ-based job system with per-account scheduling
- ✅ **Error Recovery**: Automatic retry, error classification, dead letter queue
- ✅ **Data Transformation**: Centralized transformers for all SP-API data types
- ✅ **Rate Limiting**: Automatic 429 handling with exponential backoff
- ✅ **Redis Caching**: Token and credential caching with graceful fallback

### API Clients Implemented
- ✅ **Orders API**: Order retrieval and item details
- ✅ **Finances API**: Fee breakdown and financial events
- ✅ **Reports API**: Report creation and document retrieval
- ✅ **Products API**: Catalog items, pricing, eligibility
- ✅ **Inventory API**: FBA inventory with detailed metrics (velocity, turnover, stockout risk)

See `src/modules/amazon/README.md` for detailed documentation.

## 🚀 Future Microservices

The codebase is structured for easy extraction into microservices:

1. **Auth Service**: Extract `auth` module
2. **Profit Service**: Extract `profit` module
3. **Inventory Service**: Extract `inventory` module
4. **PPC Service**: Extract `ppc` module
5. **Amazon SP-API Service**: Extract entire `amazon` module
   - Token Service (token management)
   - IAM Service (AWS credential management)
   - SP-API Gateway (API client wrapper)
   - Sync Service (data synchronization)
   - Webhook Service (notification handling)
6. **Reports Service**: Extract `reports` module and reports job
7. **Alerts Service**: Extract `alerts` module and alerts job
8. **Job Queue Service**: Extract BullMQ workers and processors

Each module can be extracted independently with minimal changes.

## 📝 Environment Variables

See `.env.example` for all required environment variables:

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `ENCRYPTION_KEY` - AES-256-CBC encryption key (32 bytes)

### Optional (Amazon SP-API)
- `AMAZON_SP_API_CLIENT_ID` - LWA Client ID
- `AMAZON_SP_API_CLIENT_SECRET` - LWA Client Secret
- `AMAZON_SP_API_REFRESH_TOKEN` - LWA Refresh Token
- `AMAZON_SP_API_REGION` - AWS region (default: us-east-1)
- `AMAZON_SP_API_OAUTH_REDIRECT_URI` - OAuth callback URL

### Optional (Redis - Recommended for Production)
- `REDIS_ENABLED` - Enable Redis (default: true)
- `REDIS_URL` - Redis connection URL (or use individual settings)
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (if required)
- `REDIS_DB` - Redis database number (default: 0)

### Optional (Sandbox Testing)
- `SANDBOX_APP_NAME` - Sandbox app name
- `SANDBOX_APP_ID` - Sandbox app ID
- `SANDBOX_REFRESH_TOKEN` - Sandbox refresh token
- `SANDBOX_CLIENT_SECRET` - Sandbox client secret (optional)

### Other
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Frontend origin for CORS
- `SMTP_*` - Email configuration

## 🔒 Security

### Authentication & Authorization
- **Helmet**: Security headers
- **CORS**: Configured for frontend origin
- **JWT**: Token-based authentication with refresh tokens
- **bcrypt**: Password hashing
- **Input validation**: Zod schemas with express-validator

### Data Protection
- **AES-256-CBC Encryption**: All sensitive credentials encrypted at rest
- **Multi-seller Isolation**: Strict user-based data access control
- **Audit Logging**: Comprehensive logging of credential changes, OAuth events, token refreshes
- **Request/Response Sanitization**: Automatic masking of sensitive data in logs
- **Webhook Signature Verification**: HMAC-SHA256 verification for Amazon webhooks

### Rate Limiting
- **Distributed Rate Limiting**: Redis-based rate limiting with in-memory fallback
- **Per-endpoint Limits**: Configurable limits per route
- **429 Handling**: Automatic retry with exponential backoff

### Token Management
- **Token Rotation**: Automatic handling of refresh token rotation
- **Token Caching**: Redis-based caching with distributed locking
- **Token Expiration**: Automatic refresh before expiration
- **IAM Credential Caching**: Temporary AWS credentials cached and refreshed

## 📚 Documentation

### External Documentation
- [Express.js](https://expressjs.com/)
- [Prisma](https://www.prisma.io/docs)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Amazon SP-API](https://developer-docs.amazon.com/sp-api/)
- [BullMQ](https://docs.bullmq.io/)
- [Redis](https://redis.io/docs/)

### Internal Documentation
- `src/modules/amazon/README.md` - Amazon SP-API integration guide
- `src/jobs/README.md` - Background job system documentation
- `src/modules/amazon/MULTI_SELLER_ISOLATION_AUDIT.md` - Security audit
- `src/modules/amazon/ISOLATION_FIXES_SUMMARY.md` - Isolation fixes

## 🎯 Implementation Status

### ✅ Completed Features
- ✅ OAuth 2.0 authorization flow
- ✅ Token rotation and management
- ✅ Multi-seller data isolation
- ✅ Webhook handlers (orders, inventory, listings, token rotation)
- ✅ Background job system (BullMQ)
- ✅ Error recovery system
- ✅ Sync scheduling per account
- ✅ Products API client
- ✅ Inventory API client with FBA metrics
- ✅ Data transformation layer
- ✅ Redis caching with graceful fallback
- ✅ Audit logging
- ✅ Security hardening (encryption, sanitization, rate limiting)

### 🚧 In Progress / Planned
- [ ] Frontend Products API integration
- [ ] Frontend Inventory API integration
- [ ] Frontend Sync Schedule management UI
- [ ] Advanced error recovery UI
- [ ] Real-time sync notifications
- [ ] Sync analytics dashboard

## 📄 License

MIT

