const Discord = require('discord.js');
const axios = require('axios');
const _ = require('lodash');
const pdKeyring = require('@polkadot/keyring');
const config = require('./config');

// Check environment variables valid
if (!process.env.ACCESS_TOKEN) {
  throw Error('Launch failed. ACCESS_TOKEN evironment variable is not set.');
}

const { tokenSymbol, sendAmount, units, networkName } = config;

let ax = axios.create({
  baseURL: process.env.BACKEND_URL || 'http://127.0.0.1:5555',
  timeout: 10000,
});

const client = new Discord.Client({ intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES] });
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async msg => {
  const { content, author: { id: sender } } = msg;
  let [action, arg0] = content.split(/[\s\n]+/);

  if (action === '!balance') {
    const res = await ax.get('/balance');
    const balance = res.data;

    msg.reply(`The faucet has ${balance/units} ${tokenSymbol}s remaining.`, `The faucet has ${balance/units} ${tokenSymbol}s remaining.`);
  }

  if (action === '!drip') {
    if (_.isEmpty(arg0)) {
      msg.reply('please enter a wallet address after !drip.');
      return;
    }

    try {
      pdKeyring.decodeAddress(arg0);
    } catch (e) {
      msg.reply(`address ${arg0} entered is incompatible to ${networkName}.`);
      return;
    }

    const res = await ax.post('/bot-endpoint', {
      sender,
      address: arg0,
      amount: sendAmount * units,
    });

    if (res.data === 'LIMIT') {
      msg.reply(`your Discord ID or the address has reached its daily quota. Please request only once every 24 hours.`);
      return;
    }

    msg.reply(`I just sent ${sendAmount} ${tokenSymbol} to address ${arg0}. Extrinsic hash: ${res.data}.`);
  }

  if (action === '!faucet') {
    msg.reply(`
Usage:
  !balance - Get the faucet's balance.
  !drip <Address> - Send ${tokenSymbol}s to <Address>.
  !faucet - Prints usage information.`);
  }
});

client.login(process.env.ACCESS_TOKEN);