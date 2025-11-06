import { session } from 'telegraf';
import { MyContext } from '../types/context.js';
import { logger } from '../../utils/logger.js';

export function setupSession() {
  return session({
    defaultSession: (): MyContext['session'] => ({
      order: {},
      step: null,
    }),
  });
}

export function resetOrderSession(ctx: MyContext) {
  ctx.session.order = {};
  ctx.session.step = null;
  logger.debug(`🔄 Session reset for user ${ctx.from?.id}`);
}
