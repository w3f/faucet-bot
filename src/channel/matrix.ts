import * as sdk from "matrix-js-sdk";
import { Storage } from "../util/storage";
import { Service } from "../services";
import { Config } from "../util/config";
import { ChannelBase } from "./base";
import logger from "../util/logger";

interface MatrixChannelConfig {
  config: Config["channel"]["matrix"];
  storage: Storage;
  service: Service;
}

export class MatrixChannel extends ChannelBase {
  private client: any;
  private service: Service;
  private config: Config["channel"]["matrix"];

  constructor(config: MatrixChannelConfig) {
    super(
      "matrix",
      config.storage
    );

    this.config = config.config;
    this.service = config.service;

    // create matrix client
    this.client = sdk.createClient({
      baseUrl: "https://matrix.org",
      // @ts-ignore
      accessToken: this.config.token,
      userId: this.config.userId,
      localTimeoutMs: 10000,
    });

    this.sendSuccessMessage = this.sendSuccessMessage.bind(this);
  }

  async start() {
    await this.client.startClient({ initialSyncLimit: 10 });

    this.service.registMessageHander(this.channelName, this.sendSuccessMessage);
    this.client.on("Room.timeline", (event: any) => {
      this.messageHandler(event);
    });
  }

  sendSuccessMessage(
    channel: Record<string, string>,
    amount: string,
    tx: string
  ) {
    this.client.sendHtmlMessage(
      channel.roomId,
      "",
      this.service.getMessage("riotSuccess", {
        amount,
        tx,
        account: channel.account,
      })
    );
  }

  async sendMessage(roomId: string, msg: string) {
    if (!msg || !roomId) return;

    this.client.sendEvent(
      roomId,
      "m.room.message",
      { body: msg, msgtype: "m.text" },
      "",
      (error: any) => error && logger.error(error)
    );
  }

  async messageHandler(event: any) {
    if (event.getType() !== "m.room.message") return;

    const {
      content: { body },
      room_id: roomId,
      sender: account,
    } = event.event;

    if (!body) return;

    const [command, param1] = this.getCommand(body);

    if (command === "!faucet") {
      this.sendMessage(roomId, this.service.usage());
    }

    if (command === "!balance") {
      const balances = await this.service.queryBalance();

      this.sendMessage(
        roomId,
        this.service.getMessage("balance", {
          account,
          balance: balances
            .map((item) => `${item.token}: ${item.balance}`)
            .join(", "),
        })
      );
    }

    if (command === "!drip") {
      const address = param1;

      try {
        await this.service.faucet({
          strategy: "normal",
          address: address,
          channel: {
            name: this.channelName,
            account: account,
            roomId: roomId,
          },
        });
      } catch (e) {
        this.sendMessage(
          roomId,
          e.message ? e.message : this.service.getErrorMessage("COMMON_ERROR", { account })
        );
      }
    }
  }
}
