require('dotenv').config();

import Bot from './src/bot';

const discord_token = process.env['DISCORD_TOKEN'] || '';
const username = process.env['SBS_USERNAME'] || '';
const password = process.env['SBS_PASSWORD'] || '';

const client = new Bot(
	discord_token,
	{username, password}
)
