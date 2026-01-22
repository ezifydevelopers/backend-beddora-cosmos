/**
 * Multi-Currency Service
 */

import prisma from '../../config/db'
import { AppError } from '../../middlewares/error.middleware'
import { logger } from '../../config/logger'
import { CurrencyRateResponse, ExchangeRateUpdateResult } from './currency.types'

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

async function getBaseCurrency() {
  const base = await prisma.currency.findFirst({ where: { isBaseCurrency: true } })
  return base || (await prisma.currency.findFirst({ where: { code: 'USD' } }))
}

async function getCurrencyByCode(code: string) {
  const normalized = normalizeCode(code)
  return prisma.currency.findFirst({ where: { code: normalized } })
}

async function getLatestRateByIds(fromCurrencyId: string, toCurrencyId: string) {
  return prisma.exchangeRate.findFirst({
    where: { fromCurrencyId, toCurrencyId },
    orderBy: { fetchedAt: 'desc' },
  })
}

export async function getCurrencies() {
  const currencies = await prisma.currency.findMany({ orderBy: { code: 'asc' } })
  return { data: currencies }
}

export async function getExchangeRate(from: string, to: string): Promise<CurrencyRateResponse> {
  const fromCode = normalizeCode(from)
  const toCode = normalizeCode(to)
  if (fromCode === toCode) {
    return { from: fromCode, to: toCode, rate: 1, fetchedAt: new Date() }
  }

  const fromCurrency = await getCurrencyByCode(fromCode)
  const toCurrency = await getCurrencyByCode(toCode)
  if (!fromCurrency || !toCurrency) {
    throw new AppError('Currency not supported', 404)
  }

  const direct = await getLatestRateByIds(fromCurrency.id, toCurrency.id)
  if (direct) {
    return { from: fromCode, to: toCode, rate: Number(direct.rate), fetchedAt: direct.fetchedAt }
  }

  // Try compute via base currency
  const base = await getBaseCurrency()
  if (!base) {
    throw new AppError('Base currency not configured', 500)
  }

  const rateFromToBase = await getLatestRateByIds(fromCurrency.id, base.id)
  const rateBaseToTo = await getLatestRateByIds(base.id, toCurrency.id)
  if (rateFromToBase && rateBaseToTo) {
    const rate = Number(rateFromToBase.rate) * Number(rateBaseToTo.rate)
    return { from: fromCode, to: toCode, rate, fetchedAt: rateBaseToTo.fetchedAt }
  }

  throw new AppError('Exchange rate not available', 404)
}

export async function updateExchangeRates(): Promise<ExchangeRateUpdateResult> {
  const base = await getBaseCurrency()
  if (!base) {
    throw new AppError('Base currency not configured', 400)
  }

  const currencies = await prisma.currency.findMany({ where: { isBaseCurrency: false } })
  const currencyCodes = currencies.map((c) => c.code)
  const baseCode = base.code

  // Use exchangerate.host (no API key required)
  const url = `https://api.exchangerate.host/latest?base=${baseCode}&symbols=${currencyCodes.join(',')}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new AppError('Failed to fetch exchange rates', 502)
  }

  const data = (await response.json()) as { rates?: Record<string, number> }
  if (!data?.rates) {
    throw new AppError('Invalid exchange rate response', 502)
  }

  const fetchedAt = new Date()
  let updatedCount = 0

  for (const currency of currencies) {
    const rate = data.rates[currency.code]
    if (!rate) continue

    await prisma.exchangeRate.create({
      data: {
        fromCurrencyId: base.id,
        toCurrencyId: currency.id,
        rate,
        fetchedAt,
      },
    })
    await prisma.exchangeRate.create({
      data: {
        fromCurrencyId: currency.id,
        toCurrencyId: base.id,
        rate: 1 / rate,
        fetchedAt,
      },
    })
    updatedCount += 2
  }

  await prisma.auditLog.create({
    data: {
      userId: 'system',
      action: 'EXCHANGE_RATE_UPDATED',
      entity: 'ExchangeRate',
      entityId: base.id,
      changes: { baseCurrency: baseCode, updatedCount },
    },
  })

  logger.info('Exchange rates updated', { baseCurrency: baseCode, updatedCount })

  return { baseCurrency: baseCode, updatedCount, fetchedAt }
}

