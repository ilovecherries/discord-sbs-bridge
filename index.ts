import Bot from './bot'
const { discord_token } = require('./config');

const client = new Bot(discord_token)
