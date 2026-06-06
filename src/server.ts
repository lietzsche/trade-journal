/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';

type Bindings = {
  DB: D1Database;
};

const JWT_SECRET = 'stock-history-super-secret-key-2026';
const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// SHA-256 helper for simple, cross-environment password hashing without native binary dependencies
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// User context interface for middleware
type Variables = {
  userId: number;
  userEmail: string;
};

const authApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Authentication Middleware
authApp.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '인증이 필요합니다. 토큰이 없거나 잘못되었습니다.' }, 401);
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    c.set('userId', payload.id as number);
    c.set('userEmail', payload.email as string);
    await next();
  } catch (err) {
    return c.json({ error: '인증 세션이 만료되었거나 토큰이 유효하지 않습니다.' }, 401);
  }
});

// Helper: Recalculate Portfolio Average Price & Quantities from scratch for a ticker
async function recalculatePortfolio(db: any, userId: number, ticker: string) {
  // Fetch all transactions for this ticker in chronological order
  const txs = await db
    .select()
    .from(schema.portfolioTransactions)
    .where(
      and(
        eq(schema.portfolioTransactions.userId, userId),
        eq(schema.portfolioTransactions.ticker, ticker)
      )
    )
    .orderBy(asc(schema.portfolioTransactions.tradeDate), asc(schema.portfolioTransactions.id));

  let quantity = 0;
  let buyPrice = 0;
  let currency = 'KRW';
  if (txs.length > 0) {
    currency = txs[0].currency || 'KRW';
  }

  for (const tx of txs) {
    if (tx.type === 'BUY') {
      const nextQty = quantity + tx.quantity;
      if (nextQty > 0) {
        buyPrice = (buyPrice * quantity + tx.price * tx.quantity) / nextQty;
      } else {
        buyPrice = 0;
      }
      quantity = nextQty;
    } else if (tx.type === 'SELL') {
      quantity = Math.max(0, quantity - tx.quantity);
      if (quantity === 0) {
        buyPrice = 0;
      }
    }
  }

  // Find existing portfolio entry
  const [existing] = await db
    .select()
    .from(schema.portfolio)
    .where(
      and(
        eq(schema.portfolio.userId, userId),
        eq(schema.portfolio.ticker, ticker)
      )
    );

  if (quantity > 0) {
    if (existing) {
      await db
        .update(schema.portfolio)
        .set({
          buyPrice,
          quantity,
          currency,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.portfolio.id, existing.id));
    } else {
      await db
        .insert(schema.portfolio)
        .values({
          userId,
          ticker,
          buyPrice,
          quantity,
          currentPrice: buyPrice, // Default current price to the first buy price
          currency,
          updatedAt: new Date().toISOString(),
        });
    }
  } else {
    // If holding becomes 0 or less, delete the portfolio record
    if (existing) {
      await db
        .delete(schema.portfolio)
        .where(eq(schema.portfolio.id, existing.id));
    }
  }
}

// ----------------------------------------------------
// Public Authentication Routes
// ----------------------------------------------------

app.post('/auth/signup', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const { email, password, nickname } = await c.req.json();

  if (!email || !password || !nickname) {
    return c.json({ error: '모든 필드를 입력해 주세요.' }, 400);
  }

  try {
    // Check email uniqueness
    const [existingUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));

    if (existingUser) {
      return c.json({ error: '이미 가입된 이메일 주소입니다.' }, 400);
    }

    const passwordHash = await hashPassword(password);
    const [newUser] = await db
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        nickname,
        role: 'user',
        createdAt: new Date().toISOString(),
      })
      .returning({ id: schema.users.id, email: schema.users.email, nickname: schema.users.nickname });

    return c.json({ success: true, user: newUser });
  } catch (err: any) {
    return c.json({ error: '회원가입 처리 중 요류가 발생했습니다: ' + err.message }, 500);
  }
});

app.post('/auth/signin', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, 400);
  }

  try {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email));

    if (!user) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    const hashedInput = await hashPassword(password);
    if (user.passwordHash !== hashedInput) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }

    // Sign JWT
    const token = await sign(
      {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days expiration
      },
      JWT_SECRET
    );

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        preferredCurrency: user.preferredCurrency,
        exchangeRate: user.exchangeRate,
      },
    });
  } catch (err: any) {
    return c.json({ error: '로그인 처리 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// ----------------------------------------------------
// Authenticated API Sub-router Mounting
// ----------------------------------------------------

// GET User Profile Check
authApp.get('/auth/me', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  try {
    const [user] = await db
      .select({ 
        id: schema.users.id, 
        email: schema.users.email, 
        nickname: schema.users.nickname,
        preferredCurrency: schema.users.preferredCurrency,
        exchangeRate: schema.users.exchangeRate
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    
    if (!user) {
      return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404);
    }
    return c.json({ success: true, user });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT User Settings Update (Manual Exchange Rate & Preferred Currency)
authApp.put('/user/settings', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  try {
    const { preferredCurrency, exchangeRate } = await c.req.json();
    if (!preferredCurrency || isNaN(Number(exchangeRate))) {
      return c.json({ error: '올바른 설정을 입력해 주세요.' }, 400);
    }

    await db
      .update(schema.users)
      .set({
        preferredCurrency,
        exchangeRate: Number(exchangeRate)
      })
      .where(eq(schema.users.id, userId));

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// A. Holdings / Portfolio List (with dynamic calculations)
authApp.get('/portfolio', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');

  try {
    const rawPortfolio = await db
      .select()
      .from(schema.portfolio)
      .where(eq(schema.portfolio.userId, userId))
      .orderBy(desc(schema.portfolio.updatedAt));

    // Map through portfolio items and execute trailing stop / target calculations
    const portfolioWithCalculations = rawPortfolio.map((item: any) => {
      const buyPrice = item.buyPrice;
      const currentPrice = item.currentPrice;
      const targetPercent = item.trailingTargetPercent ?? 10;
      const stopPercent = item.trailingStopPercent ?? 5;
      const targetFactor = targetPercent / 100;
      const stopFactor = 1 - (stopPercent / 100);

      // 1. P&L %
      const pnlPercent = ((currentPrice - buyPrice) / buyPrice) * 100;

      // 2. Trailing Stop Level (Lv = Math.floor(pnlPercent / targetPercent))
      const level = Math.floor(pnlPercent / targetPercent);
      const displayLevel = Math.max(0, level);

      // 3. Stop Loss line (trails stopPercent% below the newly achieved targetPercent%-profit milestone)
      const stopLoss = buyPrice * (1 + displayLevel * targetFactor) * stopFactor;

      // 4. Next Target Price
      let nextTarget = 0;
      if (pnlPercent < 0) {
        nextTarget = buyPrice; // Goal is break-even
      } else {
        nextTarget = buyPrice * (1 + (displayLevel + 1) * targetFactor);
      }

      const unrealizedPnL = (currentPrice - buyPrice) * item.quantity;

      return {
        ...item,
        pnlPercent,
        level: Math.max(0, level), // Level shouldn't be negative in display
        stopLoss,
        nextTarget,
        unrealizedPnL,
        marketValue: currentPrice * item.quantity,
      };
    });

    return c.json({ success: true, portfolio: portfolioWithCalculations });
  } catch (err: any) {
    return c.json({ error: '보유 자산을 조회하는 도중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// B. Update Manual Current Price
authApp.post('/portfolio/:id/price', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const id = parseInt(c.req.param('id'));
  const { currentPrice } = await c.req.json();

  if (currentPrice === undefined || isNaN(Number(currentPrice)) || Number(currentPrice) < 0) {
    return c.json({ error: '올바른 현재가를 입력해 주세요.' }, 400);
  }

  try {
    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.portfolio)
      .where(and(eq(schema.portfolio.id, id), eq(schema.portfolio.userId, userId)));

    if (!existing) {
      return c.json({ error: '수정하려는 자산을 찾을 수 없거나 권한이 없습니다.' }, 404);
    }

    await db
      .update(schema.portfolio)
      .set({
        currentPrice: Number(currentPrice),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.portfolio.id, id));

    return c.json({ success: true, message: '현재가가 수정되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '현재가 수정 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// B-2. Update Trailing Stop Settings
authApp.post('/portfolio/:id/settings', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const id = parseInt(c.req.param('id'));
  const { trailingTargetPercent, trailingStopPercent } = await c.req.json();

  if (trailingTargetPercent === undefined || isNaN(Number(trailingTargetPercent)) || Number(trailingTargetPercent) <= 0) {
    return c.json({ error: '올바른 목표 상승 트리거 비율(%)을 입력해 주세요.' }, 400);
  }
  if (trailingStopPercent === undefined || isNaN(Number(trailingStopPercent)) || Number(trailingStopPercent) <= 0 || Number(trailingStopPercent) >= 100) {
    return c.json({ error: '올바른 트레일링 스톱 비율(%)을 입력해 주세요.' }, 400);
  }

  try {
    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.portfolio)
      .where(and(eq(schema.portfolio.id, id), eq(schema.portfolio.userId, userId)));

    if (!existing) {
      return c.json({ error: '설정하려는 자산을 찾을 수 없거나 권한이 없습니다.' }, 404);
    }

    await db
      .update(schema.portfolio)
      .set({
        trailingTargetPercent: Number(trailingTargetPercent),
        trailingStopPercent: Number(trailingStopPercent),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.portfolio.id, id));

    return c.json({ success: true, message: '트레일링 스톱 설정이 수정되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '설정 수정 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// C. Transactions History with Advanced Filters
authApp.get('/transactions', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');

  const ticker = c.req.query('ticker');
  const type = c.req.query('type');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  try {
    let queries: any[] = [eq(schema.portfolioTransactions.userId, userId)];

    if (ticker) {
      queries.push(eq(schema.portfolioTransactions.ticker, ticker.trim().toUpperCase()));
    }
    if (type && (type === 'BUY' || type === 'SELL')) {
      queries.push(eq(schema.portfolioTransactions.type, type));
    }
    if (startDate) {
      queries.push(sql`date(${schema.portfolioTransactions.tradeDate}) >= date(${startDate})`);
    }
    if (endDate) {
      queries.push(sql`date(${schema.portfolioTransactions.tradeDate}) <= date(${endDate})`);
    }

    const txs = await db
      .select()
      .from(schema.portfolioTransactions)
      .where(and(...queries))
      .orderBy(desc(schema.portfolioTransactions.tradeDate), desc(schema.portfolioTransactions.id));

    return c.json({ success: true, transactions: txs });
  } catch (err: any) {
    return c.json({ error: '거래 내역 조회 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// D. Add New Transaction (Buy/Sell Log)
authApp.post('/transactions', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const body = await c.req.json();

  const { ticker, type, price, quantity, fee, currency, tradeDate, memo } = body;

  if (!ticker || !type || !price || !quantity || !tradeDate) {
    return c.json({ error: '필수 필드를 누락했습니다. (티커, 구분, 단가, 수량, 날짜)' }, 400);
  }

  if (type !== 'BUY' && type !== 'SELL') {
    return c.json({ error: '거래 구분은 BUY 또는 SELL만 가능합니다.' }, 400);
  }

  const normalizedTicker = ticker.trim().toUpperCase();
  const numPrice = Number(price);
  const numQuantity = Number(quantity);
  const numFee = Number(fee || 0);

  if (isNaN(numPrice) || numPrice <= 0 || isNaN(numQuantity) || numQuantity <= 0 || isNaN(numFee) || numFee < 0) {
    return c.json({ error: '단가, 수량, 수수료는 올바른 양수여야 합니다.' }, 400);
  }

  try {
    // If it is a SELL transaction, double check we have enough holding first
    if (type === 'SELL') {
      const [holding] = await db
        .select()
        .from(schema.portfolio)
        .where(
          and(
            eq(schema.portfolio.userId, userId),
            eq(schema.portfolio.ticker, normalizedTicker)
          )
        );

      if (!holding || holding.quantity < numQuantity) {
        return c.json({
          error: `매도할 수량이 부족합니다. 현재 보유 수량: ${holding ? holding.quantity : 0}개`,
        }, 400);
      }
    }

    // Insert transaction
    const [newTx] = await db
      .insert(schema.portfolioTransactions)
      .values({
        userId,
        ticker: normalizedTicker,
        type,
        price: numPrice,
        quantity: numQuantity,
        fee: numFee,
        currency: currency || 'KRW',
        tradeDate,
        memo,
        createdAt: new Date().toISOString(),
      })
      .returning();

    // Trigger portfolio recalculation
    await recalculatePortfolio(db, userId, normalizedTicker);

    return c.json({ success: true, transaction: newTx });
  } catch (err: any) {
    return c.json({ error: '거래를 추가하는 도중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// E. Delete Transaction
authApp.delete('/transactions/:id', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const id = parseInt(c.req.param('id'));

  try {
    // Find transaction to delete
    const [tx] = await db
      .select()
      .from(schema.portfolioTransactions)
      .where(
        and(
          eq(schema.portfolioTransactions.id, id),
          eq(schema.portfolioTransactions.userId, userId)
        )
      );

    if (!tx) {
      return c.json({ error: '삭제할 거래를 찾을 수 없거나 권한이 없습니다.' }, 404);
    }

    // In case of deleting a BUY transaction, ensure we don't end up with negative quantities in holdings
    if (tx.type === 'BUY') {
      const [holding] = await db
        .select()
        .from(schema.portfolio)
        .where(
          and(
            eq(schema.portfolio.userId, userId),
            eq(schema.portfolio.ticker, tx.ticker)
          )
        );

      if (holding && holding.quantity < tx.quantity) {
        return c.json({
          error: '이 매수 거래를 삭제하면 보유 수량이 음수가 됩니다. 먼저 다른 매도 거래들을 삭제해 주세요.',
        }, 400);
      }
    }

    // Delete transaction record
    await db
      .delete(schema.portfolioTransactions)
      .where(eq(schema.portfolioTransactions.id, id));

    // Recalculate portfolio state for this ticker
    await recalculatePortfolio(db, userId, tx.ticker);

    return c.json({ success: true, message: '거래 내역이 삭제되었으며 보유 자산이 재계산되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '거래 내역 삭제 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// E-2. Update/Edit Transaction
authApp.put('/transactions/:id', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  const { ticker, type, price, quantity, fee, currency, tradeDate, memo } = body;

  if (!ticker || !type || !price || !quantity || !tradeDate) {
    return c.json({ error: '필수 필드를 누락했습니다. (티커, 구분, 단가, 수량, 날짜)' }, 400);
  }

  if (type !== 'BUY' && type !== 'SELL') {
    return c.json({ error: '거래 구분은 BUY 또는 SELL만 가능합니다.' }, 400);
  }

  const normalizedTicker = ticker.trim().toUpperCase();
  const numPrice = Number(price);
  const numQuantity = Number(quantity);
  const numFee = Number(fee || 0);

  if (isNaN(numPrice) || numPrice <= 0 || isNaN(numQuantity) || numQuantity <= 0 || isNaN(numFee) || numFee < 0) {
    return c.json({ error: '단가, 수량, 수수료는 올바른 양수여야 합니다.' }, 400);
  }

  try {
    // Find transaction to update
    const [existingTx] = await db
      .select()
      .from(schema.portfolioTransactions)
      .where(
        and(
          eq(schema.portfolioTransactions.id, id),
          eq(schema.portfolioTransactions.userId, userId)
        )
      );

    if (!existingTx) {
      return c.json({ error: '수정하려는 거래를 찾을 수 없거나 권한이 없습니다.' }, 404);
    }

    // Update transaction
    await db
      .update(schema.portfolioTransactions)
      .set({
        ticker: normalizedTicker,
        type,
        price: numPrice,
        quantity: numQuantity,
        fee: numFee,
        currency: currency || 'KRW',
        tradeDate,
        memo,
      })
      .where(eq(schema.portfolioTransactions.id, id));

    // Recalculate portfolio state for the old and new ticker (in case ticker was changed)
    await recalculatePortfolio(db, userId, existingTx.ticker);
    if (existingTx.ticker !== normalizedTicker) {
      await recalculatePortfolio(db, userId, normalizedTicker);
    }

    return c.json({ success: true, message: '거래 내역이 수정되었으며 보유 자산이 재계산되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '거래 내역 수정 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// F. Dashboard Stats and Complex Financial Metrics
authApp.get('/dashboard', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');

  const preferredCurrency = c.req.query('preferredCurrency') || 'KRW';
  const exchangeRate = Number(c.req.query('exchangeRate') || '1350');

  // Currency Converter helper
  const convertValue = (val: number, from: string) => {
    if (from === preferredCurrency) return val;
    if (from === 'USD' && preferredCurrency === 'KRW') {
      return val * exchangeRate;
    }
    if (from === 'KRW' && preferredCurrency === 'USD') {
      return val / exchangeRate;
    }
    return val;
  };

  try {
    // 1. Fetch all holdings for Unrealized P&L
    const holdings = await db
      .select()
      .from(schema.portfolio)
      .where(eq(schema.portfolio.userId, userId));

    let totalUnrealizedPnL = 0;
    let totalPortfolioValue = 0;

    const allocationChart: { name: string; value: number }[] = [];

    holdings.forEach((item: any) => {
      const pnl = (item.currentPrice - item.buyPrice) * item.quantity;
      const convertedPnL = convertValue(pnl, item.currency || 'KRW');
      totalUnrealizedPnL += convertedPnL;
      
      const marketVal = item.currentPrice * item.quantity;
      const convertedMarketVal = convertValue(marketVal, item.currency || 'KRW');
      totalPortfolioValue += convertedMarketVal;

      allocationChart.push({
        name: item.ticker,
        value: Number(convertedMarketVal.toFixed(2)),
      });
    });

    // 2. Fetch all transactions (chronological order) for Realized P&L, Win Rate and Monthly Chart
    const allTxs = await db
      .select()
      .from(schema.portfolioTransactions)
      .where(eq(schema.portfolioTransactions.userId, userId))
      .orderBy(asc(schema.portfolioTransactions.tradeDate), asc(schema.portfolioTransactions.id));

    let totalRealizedPnL = 0;
    let closedTradesCount = 0;
    let winTradesCount = 0;

    // Track state per ticker to calculate cost basis at each SELL point
    const activeHoldings: Record<string, { quantity: number; buyPrice: number; currency: string }> = {};
    const monthlyPnL: Record<string, number> = {};

    allTxs.forEach((tx: any) => {
      const ticker = tx.ticker;
      if (!activeHoldings[ticker]) {
        activeHoldings[ticker] = { quantity: 0, buyPrice: 0, currency: tx.currency || 'KRW' };
      }

      const hold = activeHoldings[ticker];

      if (tx.type === 'BUY') {
        const nextQty = hold.quantity + tx.quantity;
        if (nextQty > 0) {
          hold.buyPrice = (hold.buyPrice * hold.quantity + tx.price * tx.quantity) / nextQty;
        } else {
          hold.buyPrice = 0;
        }
        hold.quantity = nextQty;
      } else if (tx.type === 'SELL') {
        if (hold.quantity > 0) {
          const sellQty = Math.min(hold.quantity, tx.quantity);
          const realized = (tx.price - hold.buyPrice) * sellQty - tx.fee;
          
          const convertedRealized = convertValue(realized, tx.currency || 'KRW');
          totalRealizedPnL += convertedRealized;

          // Record monthly PnL curve
          const month = tx.tradeDate.substring(0, 7); // Format: 'YYYY-MM'
          monthlyPnL[month] = (monthlyPnL[month] || 0) + convertedRealized;

          if (realized > 0) {
            winTradesCount++;
          }
          closedTradesCount++;

          hold.quantity = Math.max(0, hold.quantity - tx.quantity);
          if (hold.quantity === 0) {
            hold.buyPrice = 0;
          }
        }
      }
    });

    // Win Rate %
    const winRate = closedTradesCount > 0 ? (winTradesCount / closedTradesCount) * 100 : 0;

    // Construct monthly cumulative curve
    const months = Object.keys(monthlyPnL).sort();
    let cumulative = 0;
    const historyChart = months.map((month) => {
      cumulative += monthlyPnL[month];
      return {
        month,
        realized: Number(monthlyPnL[month].toFixed(2)),
        cumulative: Number(cumulative.toFixed(2)),
      };
    });

    // Handle warning/stop-loss risk alerts dynamically using user custom values
    const alerts: { ticker: string; message: string; type: 'warning' | 'danger' }[] = [];
    holdings.forEach((item: any) => {
      const pnlPercent = ((item.currentPrice - item.buyPrice) / item.buyPrice) * 100;
      
      // Calculate dynamic level using trailingTargetPercent (default 10%)
      const step = item.trailingTargetPercent || 10;
      const level = Math.floor(pnlPercent / step);
      const displayLevel = Math.max(0, level);
      
      // Calculate dynamic stopLoss using trailingStopPercent (default 5%)
      const stopPercent = item.trailingStopPercent || 5;
      const stopCoeff = 1 - (stopPercent / 100);
      
      // Trailing stop-loss price formula
      const stopLoss = item.buyPrice * (1 + displayLevel * (step / 100)) * stopCoeff;

      // Format currency suffix based on item's currency setting
      const currencySuffix = item.currency === 'USD' ? '$' : '원';

      // If current price is below stopLoss, trigger danger alert
      if (item.currentPrice <= stopLoss) {
        alerts.push({
          ticker: item.ticker,
          message: `현재가(${item.currentPrice.toLocaleString()}${currencySuffix})가 설정된 트레일링 익손절선(${stopLoss.toLocaleString()}${currencySuffix}) 이하로 하락했습니다! 즉시 대응이 필요합니다. (설정: 목표 +${step}% / 스톱 -${stopPercent}%)`,
          type: 'danger',
        });
      } else if (item.currentPrice <= stopLoss * 1.03) {
        // If within 3% of stop loss, trigger warning alert
        alerts.push({
          ticker: item.ticker,
          message: `현재가가 설정된 트레일링 익손절선(${stopLoss.toLocaleString()}${currencySuffix}) 대비 3% 이내 근접했습니다. 주의하세요! (설정: 목표 +${step}% / 스톱 -${stopPercent}%)`,
          type: 'warning',
        });
      }
    });

    return c.json({
      success: true,
      stats: {
        totalRealizedPnL: Number(totalRealizedPnL.toFixed(2)),
        totalUnrealizedPnL: Number(totalUnrealizedPnL.toFixed(2)),
        winRate: Number(winRate.toFixed(2)),
        closedTradesCount,
        totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
      },
      charts: {
        allocation: allocationChart,
        history: historyChart,
      },
      alerts,
    });
  } catch (err: any) {
    return c.json({ error: '대시보드 데이터를 계산하는 도중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// D. Volatility Strategy Calculator History APIs
authApp.get('/calculator/history', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');

  try {
    const history = await db
      .select()
      .from(schema.calculatorHistory)
      .where(eq(schema.calculatorHistory.userId, userId))
      .orderBy(desc(schema.calculatorHistory.createdAt));

    return c.json({ success: true, history });
  } catch (err: any) {
    return c.json({ error: '계산 히스토리를 조회하는 도중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

authApp.post('/calculator/history', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const body = await c.req.json();

  const { ticker, period, basePrice, highPrice, lowPrice, riskReward, recStop, recTarget, currentPrice, ma20, ma60 } = body;

  if (!ticker || !ticker.trim()) {
    return c.json({ error: '종목 티커를 입력해 주세요.' }, 400);
  }
  if (!period || !['week', 'month', 'quarter'].includes(period)) {
    return c.json({ error: '올바른 분석 기간을 지정해 주세요.' }, 400);
  }
  if (basePrice === undefined || isNaN(Number(basePrice)) || Number(basePrice) <= 0) {
    return c.json({ error: '올바른 기준 진입가를 입력해 주세요.' }, 400);
  }
  if (highPrice === undefined || isNaN(Number(highPrice)) || Number(highPrice) <= 0) {
    return c.json({ error: '올바른 기간 내 최고가를 입력해 주세요.' }, 400);
  }
  if (lowPrice === undefined || isNaN(Number(lowPrice)) || Number(lowPrice) <= 0) {
    return c.json({ error: '올바른 기간 내 최저가를 입력해 주세요.' }, 400);
  }
  if (currentPrice === undefined || isNaN(Number(currentPrice)) || Number(currentPrice) <= 0) {
    return c.json({ error: '올바른 현재가를 입력해 주세요.' }, 400);
  }
  if (ma20 === undefined || isNaN(Number(ma20)) || Number(ma20) <= 0) {
    return c.json({ error: '올바른 20일/주/월 이동평균선(MA20) 값을 입력해 주세요.' }, 400);
  }
  if (ma60 === undefined || isNaN(Number(ma60)) || Number(ma60) <= 0) {
    return c.json({ error: '올바른 60일/주/월 이동평균선(MA60) 값을 입력해 주세요.' }, 400);
  }

  try {
    const numCurrentPrice = Number(currentPrice);
    const numMa20 = Number(ma20);
    const numMa60 = Number(ma60);

    const score1 = ((numCurrentPrice - numMa20) / numMa20) * 100;
    const score2 = ((numMa20 - numMa60) / numMa60) * 100;

    let trendScore = 0;
    let regimeSignal = '하락 국면 ⚠️';

    if (score1 > 0 && score2 > 0) {
      regimeSignal = '상승 국면 🔥';
      trendScore = 100;
    } else if (score1 > 0 && score2 <= 0) {
      regimeSignal = '단기 반등/횡보 ⏳';
      trendScore = 60;
    } else if (score1 <= 0 && score2 > 0) {
      regimeSignal = '단기 눌림목/조정 📉';
      trendScore = 40;
    } else {
      regimeSignal = '하락 국면 ⚠️';
      trendScore = 0;
    }

    await db.insert(schema.calculatorHistory).values({
      userId,
      ticker: ticker.trim().toUpperCase(),
      period,
      basePrice: Number(basePrice),
      highPrice: Number(highPrice),
      lowPrice: Number(lowPrice),
      riskReward: Number(riskReward ?? 2.0),
      recStop: Number(recStop),
      recTarget: Number(recTarget),
      currentPrice: numCurrentPrice,
      ma20: numMa20,
      ma60: numMa60,
      trendScore,
      regimeSignal,
    });

    return c.json({ success: true, message: '전략 계산 히스토리가 저장되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '히스토리 저장 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

authApp.put('/calculator/history/:id', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  const { ticker, period, basePrice, highPrice, lowPrice, riskReward, recStop, recTarget, currentPrice, ma20, ma60 } = body;

  try {
    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.calculatorHistory)
      .where(and(eq(schema.calculatorHistory.id, id), eq(schema.calculatorHistory.userId, userId)));

    if (!existing) {
      return c.json({ error: '수정하려는 항목을 찾을 수 없거나 권한이 없습니다.' }, 404);
    }

    const updatedCurrentPrice = currentPrice !== undefined ? Number(currentPrice) : existing.currentPrice;
    const updatedMa20 = ma20 !== undefined ? Number(ma20) : existing.ma20;
    const updatedMa60 = ma60 !== undefined ? Number(ma60) : existing.ma60;

    const score1 = ((updatedCurrentPrice - updatedMa20) / updatedMa20) * 100;
    const score2 = ((updatedMa20 - updatedMa60) / updatedMa60) * 100;

    let trendScore = 0;
    let regimeSignal = '하락 국면 ⚠️';

    if (score1 > 0 && score2 > 0) {
      regimeSignal = '상승 국면 🔥';
      trendScore = 100;
    } else if (score1 > 0 && score2 <= 0) {
      regimeSignal = '단기 반등/횡보 ⏳';
      trendScore = 60;
    } else if (score1 <= 0 && score2 > 0) {
      regimeSignal = '단기 눌림목/조정 📉';
      trendScore = 40;
    } else {
      regimeSignal = '하락 국면 ⚠️';
      trendScore = 0;
    }

    await db
      .update(schema.calculatorHistory)
      .set({
        ticker: ticker ? ticker.trim().toUpperCase() : existing.ticker,
        period: period || existing.period,
        basePrice: basePrice !== undefined ? Number(basePrice) : existing.basePrice,
        highPrice: highPrice !== undefined ? Number(highPrice) : existing.highPrice,
        lowPrice: lowPrice !== undefined ? Number(lowPrice) : existing.lowPrice,
        riskReward: riskReward !== undefined ? Number(riskReward) : existing.riskReward,
        recStop: recStop !== undefined ? Number(recStop) : existing.recStop,
        recTarget: recTarget !== undefined ? Number(recTarget) : existing.recTarget,
        currentPrice: updatedCurrentPrice,
        ma20: updatedMa20,
        ma60: updatedMa60,
        trendScore,
        regimeSignal,
      })
      .where(eq(schema.calculatorHistory.id, id));

    return c.json({ success: true, message: '전략 계산 히스토리가 수정되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '히스토리 수정 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

authApp.delete('/calculator/history/:id', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');
  const id = parseInt(c.req.param('id'));

  try {
    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.calculatorHistory)
      .where(and(eq(schema.calculatorHistory.id, id), eq(schema.calculatorHistory.userId, userId)));

    if (!existing) {
      return c.json({ error: '삭제하려는 항목을 찾을 수 없거나 권한이 없습니다.' }, 404);
    }

    await db
      .delete(schema.calculatorHistory)
      .where(eq(schema.calculatorHistory.id, id));

    return c.json({ success: true, message: '전략 계산 히스토리가 삭제되었습니다.' });
  } catch (err: any) {
    return c.json({ error: '히스토리 삭제 중 오류가 발생했습니다: ' + err.message }, 500);
  }
});

// Mount Authenticated Router
app.route('/', authApp);

export default app;
