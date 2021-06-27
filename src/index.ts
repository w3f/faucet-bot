import { Keyring, WsProvider } from "@polkadot/api";
import { assert } from "@polkadot/util";
import { waitReady } from "@polkadot/wasm-crypto";
import { options } from "@setheum-js/api";

import { loadConfig } from "./util/config";
import logger from "./util/logger";
import { Storage } from "./util/storage";
import { TaskQueue } from "./services/task-queue";
import api from "./channel/api";
import { Service } from "./services";
import { MatrixChannel } from "./channel/matrix";
import { DiscordChannel } from "./channel/discord";

async function run() {
  const config = loadConfig();

  assert(config.faucet.account.mnemonic, "mnemonic need");
  assert(config.faucet.endpoint, "endpoint need");

  await waitReady();

  const keyring = new Keyring({ type: "sr25519" });
  const account = keyring.addFromMnemonic(config.faucet.account.mnemonic);
  const storage = new Storage(config.storage);
  const task = new TaskQueue(config.task);

  const service = new Service({
    account,
    storage,
    task,
    config: config.faucet,
    template: config.template,
  });

  const provider = new WsProvider(config.faucet.endpoint);

  await service.connect(options({ provider }));

  const chainName = await service.getChainName();

  logger.info(`✊ connected to ${chainName}, faucet is ready.`);

  api({ config: config.channel.api, service, storage }).then(() => {
    logger.info(`🚀 faucet api launced at port:${config.channel.api.port}.`);
  });

  if (config.channel.matrix.enable) {
    const matrix = new MatrixChannel({
      config: config.channel.matrix,
      storage,
      service,
    });

    await matrix.start().then(() => {
      logger.info(`🚀 matrix channel launced success`);
    });
  }

  if (config.channel.discord.enable) {
    const discord = new DiscordChannel({
      config: config.channel.discord,
      storage,
      service,
    });

    await discord.start().then(() => {
      logger.info(`🚀 discord channel launced success`);
    });
  }
}

run();
