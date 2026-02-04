# Server performance checklist

If the app feels slow on the server, use this checklist.

## 1. Run in production mode

- Set in `.env`: **`NODE_ENV=production`**
- Start the app with the **compiled** build, not dev:
  ```bash
  npm run build
  npm start
  ```
- Do **not** use `npm run dev` on the server (tsx watch is slower and logs every query).

## 2. Database connection

- Prefer the database in the **same region** (or same machine) as the app to reduce latency.
- Add a connection pool limit to `DATABASE_URL` so Prisma doesn’t open too many connections:
  ```text
  postgresql://user:pass@host:5432/dbname?connection_limit=10
  ```
- Ensure the DB has enough resources (CPU/RAM/connections) for your load.

## 3. Redis (optional)

- If you use Redis (queues, cache), run it **locally or in the same region**.
- If you don’t need it, you can disable it in `.env`: **`REDIS_ENABLED=false`** to avoid connection timeouts and startup delay.

## 4. Response compression

- The app uses the **compression** middleware (gzip) for responses. After pulling the latest code, run `npm install` so the dependency is installed.

## 5. Process manager (recommended)

- Use **PM2** (or similar) to run the app and restart on crash:
  ```bash
  npm install -g pm2
  pm2 start dist/server.js --name beddora-api
  pm2 save && pm2 startup
  ```

## 6. Quick checks

| Check              | Command / action                          |
|--------------------|-------------------------------------------|
| Env                | `echo $NODE_ENV` → should be `production` |
| How you start      | `npm start` (not `npm run dev`)           |
| DB reachable       | `npx prisma db execute --stdin <<< "SELECT 1"` |
| Install deps       | `npm install` (includes `compression`)    |
