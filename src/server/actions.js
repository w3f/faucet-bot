const { WsProvider, ApiPromise } = require('@polkadot/api');
const pdKeyring = require('@polkadot/keyring');

class Actions {
  async create(mnemonic, url = 'wss://westend-rpc.polkadot.io/') {
    const provider = new WsProvider(url);
    this.api = await ApiPromise.create({ provider });
    const keyring = new pdKeyring.Keyring({ type: 'sr25519' });
    this.account = keyring.addFromMnemonic(mnemonic);
  }

  async sendDOTs(address, amount = 150) {
    amount = amount * 10**6;

    const transfer = this.api.tx.balances.transfer(address, amount);
    const hash = await transfer.signAndSend(this.account);

    return hash.toHex();
  }

  async checkBalance() {
    return this.api.query.balances.freeBalance(this.account.address);
  }
}

module.exports = Actions;
