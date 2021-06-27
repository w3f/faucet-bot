import { ApiPromise } from "@polkadot/api";
import { add, template } from "lodash";
import { Token, FixedPointNumber } from "@setheum-js/sdk-core"
import { ITuple } from "@polkadot/types/types";
import { Balance, CurrencyId } from "@setheum-js/types/interfaces";
import { DispatchError } from "@polkadot/types/interfaces";
import { ApiOptions } from "@polkadot/api/types";
import { KeyringPair } from "@polkadot/keyring/types";

import { Config } from "../util/config";
import { Storage } from "../util/storage";
import { SendConfig, MessageHandler } from "../types";
import { TaskQueue, TaskData } from "./task-queue";
import logger from "../util/logger";
import { Deferred } from "../util/deferred";

interface FaucetServiceConfig {
  account: KeyringPair;
  template: Config["template"];
  config: Config["faucet"];
  storage: Storage;
  task: TaskQueue;
}

interface RequestFaucetParams {
  address: string;
  strategy: string;
  channel: {
    name: string;
    account: string;
  } & Record<string, string>;
}

export function formatToReadable(
  num: string | number,
  token: CurrencyId 
): number {
  return FixedPointNumber.fromInner(num, Token.fromCurrencyId(token).decimal).toNumber();
}

export function formatToSendable(
  num: string | number,
  token: CurrencyId 
): string {
  return new FixedPointNumber(num, Token.fromCurrencyId(token).decimal).toChainData();
}

export class Service {
  public api!: ApiPromise;
  private account: KeyringPair;
  private template: Config["template"];
  private config: Config["faucet"];
  private storage: Storage;
  private task: TaskQueue;
  private sendMessageHandler!: Record<string, MessageHandler>;
  private killCountdown: number = 1000 * 60;
  private killTimer!: NodeJS.Timeout | null;

  constructor({
    account,
    config,
    template,
    storage,
    task,
  }: FaucetServiceConfig) {
    this.account = account;
    this.config = config;
    this.template = template;
    this.storage = storage;
    this.task = task;
    this.sendMessageHandler = {};

    this.onConnected = this.onConnected.bind(this);
    this.onDisconnected = this.onDisconnected.bind(this);
  }

  private onConnected() {
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = null;
    }
  }

  private onDisconnected() {
    this.killTimer = setTimeout(() => {
      process.exit(1);
    }, this.killCountdown);
  }

  public async connect(options: ApiOptions) {
    this.api = await ApiPromise.create(options);

    await this.api.isReady.catch(() => {
      throw new Error("connect failed");
    });

    this.api.on("disconnected", this.onDisconnected);

    this.api.on("connected", this.onConnected);

    this.task.process((task: TaskData) => {
      const { address, channel, strategy, params } = task;
      const account = channel.account;
      const channelName = channel.name;
      const sendMessage = this.getMessageHandler(channelName);

      return this.sendTokens(params)
        .then((tx: string) => {

          logger.info(
            `send success, required from ${channelName}/${account} channel with address:${address} ${JSON.stringify(task.params)}`
          );

          if (!sendMessage) return;

          sendMessage(
            channel,
            params
	      .map((item) => `${item.token}: ${formatToReadable(item.balance, this.api.createType('CurrencyId' as any, { Token: item.token }))}`)
              .join(", "),
            tx
          );
        })
        .catch(async (e) => {
          logger.error(e);

          await this.storage.decrKeyCount(`service_${strategy}_${address}`);

          if (account) {
            await this.storage.decrKeyCount(`service_${strategy}_${channelName}_${account}`);
          }
        });
    });
  }

  public registMessageHander(channel: string, handler: MessageHandler) {
    this.sendMessageHandler[channel] = handler;
  }

  private getMessageHandler (channel: string) {
    return this.sendMessageHandler[channel];
  }

  public async queryBalance() {
    const result = await Promise.all(
      this.config.assets.map((token) =>
        (this.api as any).derive.currencies.balance(
          this.account.address,
          { Token: token }
        )
      )
    );

    return this.config.assets.map((token, index) => {
      return {
        token: token,
        balance: result[index]
          ? formatToReadable(
              (result[index] as Balance).toString(),
              this.api.createType('CurrencyId' as any, { Token: token })
            )
          : 0,
      };
    });
  }

  public async getChainName() {
    return this.api.rpc.system.chain();
  }

  public async sendTokens(config: SendConfig) {
    const deferred = new Deferred<string>();
    const tx = this.buildTx(config);
    const sigendTx = await tx.signAsync(this.account);

    const unsub = await sigendTx
      .send((result) => {
        if (result.isCompleted) {
          // extra message to ensure tx success
          let flag = true;
          let errorMessage: DispatchError["type"] = "";

          for (const event of result.events) {
            const { data, method, section } = event.event;

            if (section === "utility" && method === "BatchInterrupted") {
              flag = false;
              errorMessage = "batch error";
              break;
            }

            // if extrinsic failed
            if (section === "system" && method === "ExtrinsicFailed") {
              const [dispatchError] = (data as unknown) as ITuple<
                [DispatchError]
              >;

              // get error message
              if (dispatchError.isModule) {
                try {
                  const mod = dispatchError.asModule;
                  const error = this.api.registry.findMetaError(
                    new Uint8Array([Number(mod.index), Number(mod.error)])
                  );

                  errorMessage = `${error.section}.${error.name}`;
                } catch (error) {
                  // swallow error
                  errorMessage = "Unknown error";
                }
              }
              flag = false;
              break;
            }
          }

          if (flag) {
            deferred.resolve(sigendTx.hash.toString());
          } else {
            deferred.reject(errorMessage);
          }

          unsub && unsub();
        }
      })
      .catch((e) => {
        deferred.reject(e);
      });

    return deferred.promise;
  }

  public buildTx(config: SendConfig) {
    return this.api.tx.utility.batch(
      config.map(({ token, balance, dest }) =>
        this.api.tx.currencies.transfer(dest, { token: token }, balance)
      )
    );
  }

  public usage() {
    return this.template.usage;
  }

  async faucet({ strategy, address, channel }: RequestFaucetParams): Promise<any> {
    logger.info(
      `requect faucet, ${JSON.stringify(
        strategy
      )}, ${address}, ${JSON.stringify(channel)}`
    );

    const strategyDetail = this.config.strategy[strategy];

    const account = channel?.account;
    const channelName = channel.name;

    try {
      await this.task.checkPendingTask();
    } catch (e) {
      throw new Error(this.getErrorMessage("PADDING_TASK_MAX"));
    }

    if (!strategyDetail) {
      throw new Error(this.getErrorMessage("NO_STRAGEGY"));
    }

    // check account limit
    let accountCount = 0;
    if (account && strategyDetail.checkAccount) {
      accountCount = await this.storage.getKeyCount(`service_${strategy}_${channelName}_${account}`);
    }

    if (strategyDetail.limit && accountCount >= strategyDetail.limit) {
      throw new Error(this.getErrorMessage("LIMIT", { account: channel.account || address }));
    }

    // check address limit
    let addressCount = 0;
    try {
      addressCount = await this.storage.getKeyCount(`service_${strategy}_${address}`);
    } catch (e) {
      throw new Error(this.getErrorMessage("CHECK_LIMIT_FAILED"));
    }

    if (strategyDetail.limit && addressCount >= strategyDetail.limit) {
      throw new Error(
        this.getErrorMessage("LIMIT", { account: channel.account || address })
      );
    }

    // check build tx
    const params = strategyDetail.amounts.map((item) => ({
      token: item.asset,
      balance: formatToSendable(item.amount, this.api.createType('CurrencyId' as any, { Token: item.asset })),
      dest: address,
    }));

    try {
      this.buildTx(params);
    } catch (e) {
      logger.error(e);

      throw new Error(this.getErrorMessage("CHECK_TX_FAILED", { error: e }));
    }

    // increase account & address limit count
    try {
      if (account && strategyDetail.checkAccount) {
        await this.storage.incrKeyCount(`service_${strategy}_${channelName}_${account}`, strategyDetail.frequency);
      }

      await this.storage.incrKeyCount(`service_${strategy}_${address}`, strategyDetail.frequency);
    } catch (e) {
      throw new Error(this.getErrorMessage("UPDATE_LIMIT_FAILED"));
    }

    try {
      const result = await this.task.insert({
        address,
        strategy,
        channel,
        params
      });

      return result;
    } catch (e) {
      logger.error(e);

      await this.storage.decrKeyCount(`service_${strategy}_${address}`);

      if (account) {
        await this.storage.decrKeyCount(`service_${strategy}_${channelName}_${account}`);
      }

      throw new Error(this.getErrorMessage("INSERT_TASK_FAILED"));
    }
  }

  getErrorMessage(code: string, params?: any) {
    return template(this.template.error[code] || "Faucet error.")(params);
  }

  getMessage(name: string, params?: any) {
    return template(this.template[name] || "Empty")(params);
  }
}
