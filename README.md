# Beddora Backend

A modular monolith backend for Beddora SaaS application built with Node.js, Express, TypeScript, PostgreSQL, and Prisma.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
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
│   │   ├── accounts/      # Amazon account management
│   │   ├── marketplaces/  # Marketplace data
│   │   ├── profit/        # Profit calculations (example)
│   │   ├── inventory/     # Inventory management
│   │   ├── expenses/      # Expense tracking
│   │   ├── cashflow/      # Cashflow tracking
│   │   ├── ppc/           # PPC campaign management
│   │   ├── alerts/        # Alerts and notifications
│   │   ├── autoresponder/ # Automated email responses
│   │   ├── reimbursements/# Amazon reimbursements
│   │   ├── reports/       # Report generation
│   │   ├── admin/         # Admin operations
│   │   └── amazon/        # Amazon SP API integration
│   │       ├── sp-api.client.ts
│   │       ├── sync.service.ts
│   │       └── webhooks.ts
│   │
│   ├── middlewares/        # Express middlewares
│   │   ├── auth.middleware.ts    # JWT authentication
│   │   ├── role.middleware.ts     # Role-based access control
│   │   └── error.middleware.ts   # Error handling
│   │
│   ├── jobs/               # Background jobs (cron)
│   │   ├── data-sync.job.ts
│   │   ├── reports.job.ts
│   │   └── alerts.job.ts
│   │
│   └── utils/              # Utility functions
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

- **Auth**: User, Role, UserRole
- **Accounts**: Account, Marketplace
- **Products**: Product, Inventory, Supplier, PurchaseOrder
- **Orders**: Order, OrderItem, Fee, Refund
- **PPC**: PPC_Campaign
- **Financial**: Expense, Cashflow
- **System**: Alert, Reimbursement, Report, AuditLog

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

### Amazon SP API
- `POST /api/amazon/sync/orders/:accountId` - Sync orders
- `POST /api/amazon/sync/products/:accountId` - Sync products
- `POST /api/amazon/sync/inventory/:accountId` - Sync inventory
- `POST /api/amazon/sync/ppc/:accountId` - Sync PPC campaigns

## 🔄 Background Jobs

Background jobs run automatically:

- **Data Sync Job**: Runs every hour, syncs data from Amazon SP API
- **Reports Job**: Runs daily at 2 AM, generates scheduled reports
- **Alerts Job**: Runs every 15 minutes, checks conditions and creates alerts

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

## 🚀 Future Microservices

The codebase is structured for easy extraction into microservices:

1. **Auth Service**: Extract `auth` module
2. **Profit Service**: Extract `profit` module
3. **Inventory Service**: Extract `inventory` module
4. **PPC Service**: Extract `ppc` module
5. **Data Sync Service**: Extract `amazon/sync.service` and jobs
6. **Reports Service**: Extract `reports` module and reports job
7. **Alerts Service**: Extract `alerts` module and alerts job

Each module can be extracted independently with minimal changes.

## 📝 Environment Variables

See `.env.example` for all required environment variables:

- Database connection
- JWT secrets
- Email configuration
- Amazon SP API credentials
- CORS settings

## 🔒 Security

- **Helmet**: Security headers
- **CORS**: Configured for frontend origin
- **JWT**: Token-based authentication
- **bcrypt**: Password hashing
- **Input validation**: express-validator

## 📚 Documentation

- [Express.js](https://expressjs.com/)
- [Prisma](https://www.prisma.io/docs)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Amazon SP API](https://developer-docs.amazon.com/sp-api/)

## 📄 License

MIT

