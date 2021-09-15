import Bot from './src/bot'
const { discord_token, username, password } = require('./config');

const client = new Bot(
	discord_token,
	{username, password}
)
