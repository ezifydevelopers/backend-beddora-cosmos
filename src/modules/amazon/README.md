# Amazon SP-API Integration

Production-ready backend implementation for Amazon Selling Partner API (SP-API) integration.

## Architecture

This module follows a **monolithic structure that is microservice-ready**. Each component can be extracted to a separate microservice in the future.

### Folder Structure

```
src/modules/amazon/
├── account.service.ts          # AmazonAccount CRUD operations
├── token.service.ts            # LWA token exchange (refresh → access)
├── iam.service.ts              # IAM role assumption
├── sp-api-wrapper.service.ts   # Generic SP-API client wrapper
├── test.controller.ts          # Test endpoints for verification
├── amazon.controller.ts        # Business logic controllers
├── amazon.routes.ts           # Route definitions
└── README.md                  # This file
```

## Components

### 1. Database Schema (`AmazonAccount`)

The `AmazonAccount` model stores per-seller SP-API credentials:

- **userId**: Internal user reference (seller_id)
- **amazonSellerId**: Amazon's seller ID
- **marketplace**: Marketplace code (e.g., "US", "DE", "JP")
- **lwaClientId**: LWA Client ID (encrypted)
- **lwaClientSecret**: LWA Client Secret (encrypted)
- **refreshToken**: LWA Refresh Token (encrypted) - **NEVER exposed to frontend**
- **iamRoleArn**: AWS IAM Role ARN for assuming role
- **marketplaceIds**: Array of marketplace IDs
- **region**: AWS region (defaults to us-east-1)

**Security**: All sensitive fields are encrypted using AES-256-CBC before storage.

### 2. Token Management Service (`token.service.ts`)

**Responsibilities:**
- Exchange refresh token for access token
- Handle token expiration and refresh
- Cache tokens to minimize API calls
- Pure token lifecycle management (no business logic)

**Key Functions:**
- `getAccessToken()`: Exchange refresh token for access token
- `clearTokenCache()`: Clear cached tokens
- `getTokenCacheStats()`: Get cache statistics

**Usage:**
```typescript
import { getAccessToken } from './token.service'

const credentials = {
  clientId: 'your-lwa-client-id',
  clientSecret: 'your-lwa-client-secret',
  refreshToken: 'your-refresh-token',
}

const tokenResponse = await getAccessToken(credentials, 'us-east-1')
// Returns: { access_token, token_type, expires_in, refresh_token? }
```

### 3. IAM Role Assumption Service (`iam.service.ts`)

**Responsibilities:**
- Assume configured IAM role
- Generate temporary AWS credentials
- Handle credential expiration
- Cache credentials to minimize STS calls

**Key Functions:**
- `assumeRole()`: Assume IAM role and get temporary credentials
- `clearCredentialsCache()`: Clear cached credentials
- `getCredentialsCacheStats()`: Get cache statistics

**Usage:**
```typescript
import { assumeRole } from './iam.service'

const credentials = await assumeRole(
  'arn:aws:iam::123456789012:role/SP-API-Role',
  'us-east-1'
)
// Returns: { accessKeyId, secretAccessKey, sessionToken, expiration }
```

### 4. SP-API Client Wrapper (`sp-api-wrapper.service.ts`)

**Responsibilities:**
- Accept seller context (AmazonAccount ID)
- Retrieve and decrypt stored credentials
- Exchange refresh token for access token
- Assume IAM role for request signing
- Make authenticated SP-API calls
- Handle retries and errors

**Key Features:**
- Automatic token refresh
- Automatic IAM credential refresh
- Request signing with AWS Signature Version 4
- Retry logic with exponential backoff
- Comprehensive error handling

**Usage:**
```typescript
import { SPAPIWrapper } from './sp-api-wrapper.service'

// Initialize wrapper with AmazonAccount ID
const client = new SPAPIWrapper(amazonAccountId)
await client.initialize()

// Make SP-API calls
const orders = await client.get('/orders/v0/orders', {
  MarketplaceIds: ['ATVPDKIKX0DER'],
  CreatedAfter: '2024-01-01T00:00:00Z',
})

// POST request
const report = await client.post('/reports/2021-06-30/reports', {
  reportType: 'GET_FLAT_FILE_OPEN_LISTINGS_DATA',
  marketplaceIds: ['ATVPDKIKX0DER'],
})
```

### 5. Account Service (`account.service.ts`)

**Responsibilities:**
- Store seller SP-API credentials securely
- Retrieve and decrypt credentials
- Update credentials (e.g., on token rotation)
- Delete credentials when seller disconnects

**Key Functions:**
- `upsertAmazonAccount()`: Create or update account
- `getAmazonAccount()`: Get account (with optional decryption)
- `getUserAmazonAccounts()`: Get all accounts for a user
- `updateAmazonAccount()`: Update account fields
- `deleteAmazonAccount()`: Soft delete (set isActive = false)
- `hardDeleteAmazonAccount()`: Permanently delete

**Usage:**
```typescript
import { upsertAmazonAccount } from './account.service'

await upsertAmazonAccount({
  userId: 'user-id',
  amazonSellerId: 'A1B2C3D4E5F6G7',
  marketplace: 'US',
  lwaClientId: 'client-id',
  lwaClientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  iamRoleArn: 'arn:aws:iam::123456789012:role/SP-API-Role',
  marketplaceIds: ['ATVPDKIKX0DER'],
  region: 'us-east-1',
})
```

### 6. Test Endpoints (`test.controller.ts`)

**Endpoints:**
- `GET /api/amazon/test/orders`: Test SP-API integration by fetching orders
- `GET /api/amazon/test/status`: Test credential storage and token exchange

**Usage:**
```bash
# Test orders API
curl -X GET "http://localhost:3001/api/amazon/test/orders?amazonAccountId=account-id&marketplaceId=ATVPDKIKX0DER" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test status
curl -X GET "http://localhost:3001/api/amazon/test/status?amazonAccountId=account-id" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Security Best Practices

1. **Never log refresh tokens**: Refresh tokens are treated like passwords
2. **Never expose tokens to frontend**: All token operations are server-side only
3. **Encrypt sensitive data**: All credentials are encrypted before storage
4. **Use IAM roles**: Prefer IAM role assumption over static AWS credentials
5. **Token rotation**: Support token rotation when Amazon provides new refresh token
6. **Cache management**: Tokens and credentials are cached but expire automatically

## Migration to Microservices

This architecture is designed to be easily extracted into microservices:

1. **Token Service**: Can become a dedicated token management microservice
2. **IAM Service**: Can become a dedicated IAM/STS microservice
3. **SP-API Wrapper**: Can become a dedicated SP-API gateway microservice
4. **Account Service**: Can become a dedicated account management microservice

Each service is:
- **Stateless**: No shared state between requests
- **Independent**: Can be deployed separately
- **Reusable**: Can be used by multiple consumers
- **Testable**: Each component can be tested in isolation

## Example Usage Flow

```typescript
// 1. Store credentials (after OAuth)
import { upsertAmazonAccount } from './account.service'

await upsertAmazonAccount({
  userId: 'user-123',
  amazonSellerId: 'A1B2C3D4E5F6G7',
  marketplace: 'US',
  lwaClientId: 'client-id',
  lwaClientSecret: 'client-secret',
  refreshToken: 'refresh-token-from-oauth',
  iamRoleArn: 'arn:aws:iam::123456789012:role/SP-API-Role',
  marketplaceIds: ['ATVPDKIKX0DER'],
  region: 'us-east-1',
})

// 2. Use SP-API wrapper to make calls
import { SPAPIWrapper } from './sp-api-wrapper.service'

const client = new SPAPIWrapper(amazonAccountId)
await client.initialize()

// Fetch orders
const orders = await client.get('/orders/v0/orders', {
  MarketplaceIds: ['ATVPDKIKX0DER'],
  CreatedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
})

// Fetch inventory
const inventory = await client.get('/fba/inventory/v1/summaries', {
  marketplaceIds: ['ATVPDKIKX0DER'],
  granularityType: 'Marketplace',
})
```

## Error Handling

All services use consistent error handling:

- **400**: Bad request (missing/invalid parameters)
- **401**: Unauthorized (invalid/expired tokens)
- **403**: Forbidden (insufficient permissions)
- **429**: Rate limit exceeded
- **500**: Server error
- **504**: Timeout

Errors are logged with context but never expose sensitive data.

## Dependencies

- `@aws-sdk/client-sts`: AWS SDK for IAM role assumption
- `axios`: HTTP client for SP-API calls
- `crypto`: Node.js crypto for encryption and request signing

## Testing

Use the test endpoints to verify integration:

1. **Test Status**: Verifies credential storage and token exchange
2. **Test Orders**: Verifies full authentication chain and makes real API call

Both endpoints require authentication and verify that the AmazonAccount belongs to the authenticated user.

## Future Enhancements

- [ ] Redis-based token/credential caching (for multi-instance deployments)
- [ ] Token rotation webhook handling
- [ ] Rate limiting per seller
- [ ] Request/response logging for debugging
- [ ] Metrics and monitoring integration
