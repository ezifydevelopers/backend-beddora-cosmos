# Quick Start Guide

## 🚀 Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

```bash
# Create PostgreSQL database
createdb beddora

# Or use your preferred method to create the database
```

### 3. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings:
# - DATABASE_URL: PostgreSQL connection string
# - JWT_SECRET: Random secret for JWT tokens
# - SMTP settings: For email functionality
# - Amazon SP API credentials: If using Amazon integration
```

### 4. Initialize Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database (optional - creates default roles)
npm run prisma:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3001`

## 📝 Next Steps

### 1. Test Authentication

```bash
# Register a user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123",
    "name": "Test User"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123"
  }'
```

### 2. Add Business Logic

Each module has placeholder business logic. Add your implementation in:

- **Services** (`*.service.ts`): All business logic goes here
- **Controllers** (`*.controller.ts`): Only handle HTTP, call services

### 3. Connect Amazon SP API

1. Get Amazon SP API credentials
2. Update `.env` with credentials
3. Implement sync logic in `src/modules/amazon/sync.service.ts`

### 4. Customize Background Jobs

Edit job files in `src/jobs/`:
- `data-sync.job.ts`: Sync frequency and logic
- `reports.job.ts`: Report generation schedule
- `alerts.job.ts`: Alert conditions

## 🏗️ Module Development

### Example: Adding a New Endpoint

1. **Add service method** in `module.service.ts`:
```typescript
export async function myNewFunction(userId: string, data: any) {
  // Business logic here
  return { result: 'data' }
}
```

2. **Add controller method** in `module.controller.ts`:
```typescript
export async function myNewEndpoint(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await moduleService.myNewFunction(req.userId, req.body)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
}
```

3. **Add route** in `module.routes.ts`:
```typescript
router.post('/my-endpoint', authenticate, moduleController.myNewEndpoint)
```

## 🔍 Common Tasks

### View Database

```bash
npm run prisma:studio
```

Opens Prisma Studio in browser to view/edit database.

### Create Migration

```bash
npm run prisma:migrate
```

### Reset Database

```bash
# WARNING: This will delete all data
npx prisma migrate reset
```

## 🐛 Troubleshooting

### Database Connection Error

- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Verify database exists

### Port Already in Use

Change `PORT` in `.env` or kill the process using port 3001

### Prisma Client Not Generated

```bash
npm run prisma:generate
```

### TypeScript Errors

```bash
# Rebuild
npm run build
```

## 📚 Key Files

- `src/server.ts`: Entry point, starts server and jobs
- `src/app.ts`: Express app configuration
- `src/routes.ts`: All route registrations
- `prisma/schema.prisma`: Database schema
- `.env`: Environment configuration

## 🎯 Architecture Notes

- **Controllers**: HTTP layer only, call services
- **Services**: All business logic here
- **Routes**: Define endpoints, apply middlewares
- **Middlewares**: Auth, roles, error handling
- **Jobs**: Background tasks (cron)

## 📖 Documentation

See `README.md` for full documentation.

