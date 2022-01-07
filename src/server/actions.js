const { WsProvider, ApiPromise } = require('@polkadot/api');
const pdKeyring = require('@polkadot/keyring');

class Actions {
  async create({ mnemonic, polkadot }) {
    const { endpoint, ss58Prefix } = polkadot;
    const provider = new WsProvider(endpoint);
    this.api = await ApiPromise.create({ provider });
    const keyring = new pdKeyring.Keyring({ type: 'sr25519' });
    keyring.setSS58Format(ss58Prefix);
    this.account = keyring.addFromMnemonic(mnemonic);
  }

  async sendToken(address, amount) {
    const transfer = this.api.tx.balances.transfer(address, amount);
    const hash = await transfer.signAndSend(this.account);
    return hash.toHex();
  }

  async checkBalance() {
    let balance = 0;
    try {
      const { data: { free } } = await this.api.query.system.account(this.account.address);
      balance = free;
    } catch (error) {
      console.error('Check balance failed. error: ', error);
    }
    return balance;
  }
}

module.exports = Actions;
