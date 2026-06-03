import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nickname: text('nickname').notNull(),
  role: text('role').default('user').notNull(),
  preferredCurrency: text('preferred_currency').$type<'KRW' | 'USD'>().default('KRW').notNull(),
  exchangeRate: real('exchange_rate').default(1350).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const portfolio = sqliteTable('portfolio', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  ticker: text('ticker').notNull(),
  buyPrice: real('buy_price').notNull(),
  quantity: real('quantity').notNull(),
  currentPrice: real('current_price').notNull(),
  currency: text('currency').$type<'KRW' | 'USD'>().default('KRW').notNull(),
  trailingTargetPercent: real('trailing_target_percent').default(10).notNull(),
  trailingStopPercent: real('trailing_stop_percent').default(5).notNull(),
  memo: text('memo'),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const portfolioTransactions = sqliteTable('portfolio_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  ticker: text('ticker').notNull(),
  type: text('type').$type<'BUY' | 'SELL'>().notNull(),
  price: real('price').notNull(),
  quantity: real('quantity').notNull(),
  fee: real('fee').default(0).notNull(),
  currency: text('currency').$type<'KRW' | 'USD'>().default('KRW').notNull(),
  tradeDate: text('trade_date').notNull(),
  memo: text('memo'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const calculatorHistory = sqliteTable('calculator_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  ticker: text('ticker').notNull(),
  period: text('period').$type<'week' | 'month' | 'quarter'>().notNull(),
  basePrice: real('base_price').notNull(),
  highPrice: real('high_price').notNull(),
  lowPrice: real('low_price').notNull(),
  riskReward: real('risk_reward').notNull(),
  recStop: integer('rec_stop').notNull(),
  recTarget: integer('rec_target').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
