const express = require('express');
const bodyParser = require('body-parser');

const Actions = require('./actions.js');
const Storage = require('./storage.js');
const config = require('./config');

const storage = new Storage();
const app = express();
app.use(bodyParser.json());

app.get('/health', (_, res) => {
  res.send('Faucet backend is healthy.');
});

const createAndApplyActions = async () => {
  const { mnemonic, polkadot, sendTimesLimit } = config;
  const actions = new Actions();
  await actions.create({ mnemonic, polkadot });

  app.get('/balance', async (_, res) => {
    const balance = await actions.checkBalance();
    res.send(balance.toString());
  });
  
  app.post('/bot-endpoint', async (req, res) => {
    const { address, amount, sender } = req.body;
    if (!(await storage.isValid(sender, address, sendTimesLimit)) && !sender.endsWith(':web3.foundation')) {
      res.send('LIMIT');
    } else {
      storage.saveData(sender, address);
      const hash = await actions.sendDOTs(address, amount);
      res.send(hash);
    }
  });
}

const main = async () => {
  const { port } = config;
  await createAndApplyActions();
  app.listen(port, () => console.log(`Faucet backend listening on port ${port}.`));
}

try {
  main();
} catch (e) { console.error(e); }
