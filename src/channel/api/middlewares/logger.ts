import { Logger, LeveledLogMethod } from "winston";
import { Middleware } from "koa";

import logger from "../../../util/logger";

const getLoggerLevel = (code: number, logger: Logger): LeveledLogMethod => {
  switch (Math.floor(code / 100)) {
    case 5: {
      return logger.error;
    }
    case 4: {
      return logger.warn;
    }
  }

  return logger.info;
};

export const loggerMiddware: Middleware = async (ctx, next) => {
  await next();
  getLoggerLevel(
    ctx.status,
    logger
  )({
    method: ctx.method,
    url: ctx.originalUrl,
    params: ctx.request.body,
    result: ctx.response.body,
    status: ctx.status,
  });
};
