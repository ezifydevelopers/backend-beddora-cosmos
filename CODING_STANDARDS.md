# Coding Standards

This document outlines the coding standards and best practices for the Beddora SaaS application.

## TypeScript Standards

### ✅ Type Safety
- **No `any` types**: All types must be explicitly defined
- **Proper interfaces**: Use interfaces for object shapes
- **Type definitions**: Create shared type files in `src/types/`
- **Return types**: All functions must have explicit return types

### ✅ Naming Conventions
- **PascalCase**: Interfaces, types, classes, components
- **camelCase**: Variables, functions, methods
- **UPPER_SNAKE_CASE**: Constants
- **Meaningful names**: Avoid abbreviations, use descriptive names

### ✅ File Organization
```
src/
  types/           # Shared type definitions
  modules/         # Feature modules (business logic)
  middlewares/     # Express middlewares
  config/          # Configuration files
  utils/           # Utility functions
```

## Enterprise SaaS Best Practices

### ✅ Separation of Concerns
- **Services**: Business logic only (no HTTP, no database queries directly)
- **Controllers**: Request/response handling only
- **Routes**: Route definitions only
- **Middlewares**: Cross-cutting concerns (auth, errors, validation)

### ✅ Comments & Documentation
- **Complex logic**: Always comment complex business logic
- **Function docs**: JSDoc comments for public functions
- **Business rules**: Document business rules in comments
- **Security notes**: Document security considerations

### ✅ Error Handling
- **AppError class**: Use for operational errors
- **Centralized handling**: Error middleware handles all errors
- **Type-safe errors**: Proper Prisma error handling with types
- **User-friendly messages**: Don't expose internal errors

### ✅ Security
- **Password hashing**: bcrypt with 12 rounds minimum
- **JWT tokens**: Short-lived access tokens, long-lived refresh tokens
- **Token rotation**: Refresh tokens rotated on use
- **Input validation**: Validate all inputs with Joi
- **SQL injection**: Use Prisma (parameterized queries)

### ✅ Database
- **Prisma ORM**: Use Prisma for all database operations
- **Transactions**: Use transactions for multi-step operations
- **Indexes**: Proper indexes on foreign keys and search fields
- **Relations**: Proper foreign key constraints

### ✅ Code Quality
- **No tight coupling**: Dependencies injected, not hardcoded
- **Reusable code**: Extract common logic to utilities
- **DRY principle**: Don't repeat yourself
- **Single responsibility**: Each function does one thing

## Examples

### ✅ Good: Type-Safe Service
```typescript
import { CreateAccountData, AccountResponse } from '../../types/account.types'

/**
 * Create new account for user
 * 
 * Business Logic:
 * - Creates account record
 * - Links to user via UserAccount junction
 * - Sets as default if first account
 * 
 * @param userId - The ID of the user
 * @param data - Account creation data
 * @returns Created account information
 */
export async function createAccount(
  userId: string,
  data: CreateAccountData
): Promise<AccountResponse> {
  // Implementation...
}
```

### ❌ Bad: Using `any` Types
```typescript
export async function createAccount(userId: string, data: any) {
  // No type safety!
}
```

### ✅ Good: Proper Error Handling
```typescript
if (err instanceof Prisma.PrismaClientKnownRequestError) {
  if (err.code === 'P2002') {
    res.status(409).json({ error: 'Duplicate entry' })
    return
  }
}
```

### ❌ Bad: Generic Error Handling
```typescript
const prismaError = err as any
if (prismaError.code === 'P2002') {
  // No type safety!
}
```

## Frontend Standards

### ✅ TypeScript
- **RootState type**: Use `RootState` from store for type-safe state access
- **No `as any`**: Proper type assertions
- **Component props**: Explicit prop types

### ✅ RTK Query
- **Tag types**: Use tag types for cache invalidation
- **Type-safe queries**: Proper return types for all endpoints

### ✅ Redux
- **Typed hooks**: Use `useAppSelector` and `useAppDispatch`
- **Slice types**: Proper action and state types

## Checklist

Before submitting code, ensure:
- [ ] No `any` types used
- [ ] All functions have return types
- [ ] Complex logic is commented
- [ ] Business rules are documented
- [ ] Error handling is type-safe
- [ ] No tight coupling
- [ ] Meaningful variable names
- [ ] Proper separation of concerns
