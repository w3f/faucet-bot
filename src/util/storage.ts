import redis, { RedisClient, ClientOpts } from "redis";
import dayjs, { OpUnitType } from "dayjs";
import { promisify } from "util";

interface StorageOptions {
  redis: ClientOpts;
}

export class Storage {
  private client: RedisClient;
  private get: (key: string) => Promise<string | null>;
  private incr: (key: string) => Promise<number>;
  private decr: (key: string) => Promise<number>;
  private expireat: (key: string, timestamp: number) => Promise<number>;

  constructor({ redis: redisConfig }: StorageOptions) {
    this.client = redis.createClient(redisConfig);

    this.get = promisify(this.client.get).bind(this.client);
    this.incr = promisify(this.client.incr).bind(this.client);
    this.decr = promisify(this.client.decr).bind(this.client);
    this.expireat = promisify(this.client.expireat).bind(this.client);
  }

  async incrKeyCount(
    key: string,
    frequency: [string, OpUnitType]
  ): Promise<number> {
    console.log('inc', key)
    const amount = await this.incr(key);

    const expireTime = dayjs()
      .add(Number(frequency[0]), frequency[1])
      .startOf(frequency[1])
      .unix();

    // preset expire time
    await this.expireat(key, expireTime);

    return amount;
  }

  async decrKeyCount(key: string): Promise<number> {
    console.log('desc', key)
    return this.decr(key);
  }

  async getKeyCount(key: string): Promise<number> {
    const result = await this.get(key);

    return Number(result) || 0;
  }
}
