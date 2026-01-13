/**
 * Common TypeScript type definitions
 * 
 * Enterprise SaaS best practices:
 * - All types are explicitly defined
 * - No `any` types used
 * - Types are reusable and well-documented
 */

import { Prisma } from '@prisma/client'

/**
 * Generic filter interface for list endpoints
 */
export interface BaseFilter {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * Prisma query event types
 */
export interface PrismaQueryEvent {
  query: string
  params: string
  duration: number
  target: string
}

export interface PrismaErrorEvent {
  message: string
  target: string
}

export interface PrismaWarnEvent {
  message: string
  target: string
}

/**
 * Update data type helper
 * Makes all fields optional except those specified
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>

/**
 * Update data type helper
 * Makes all fields optional
 */
export type UpdateData<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>
