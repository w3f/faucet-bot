# Neumann faucet bot

## Requirement
- node: v16.13.1
- npm
- pm2

## Configuration
Create an `ecosystem.config.js` file in the project root directory and set the parameters.

```
module.exports = {
  apps : [{
    name: 'server',
    script: './src/server/index.js',
    watch: false,
    env: {
      FAUCET_MNEMONIC: '<faucet_mnemonic_phrase>',
      CHAIN_WS_ENDPOINT: 'wss://neumann.api.onfinality.io/public-ws',
      PORT: 5555
    },
  }, {
    name: 'discord',
    script: './src/bot/discord.js',
    watch: false,
    env: {
      ACCESS_TOKEN: '<discord_access_token>',
      BACKEND_URL: 'http://127.0.0.1:5555'
    },
  }],
};
```

## Launch

### Install dependences
```
npm i
```

### Run command to launch server

```
pm2 start
```



