import winston from "winston";

export default winston.createLogger({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(
      (info) =>
        `${info.timestamp} | ${info.level}: ${JSON.stringify(info.message)}`
    )
  ),
  defaultMeta: { service: "faucet-service" },
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
    new winston.transports.Console({ level: "debug" }),
  ],
});
