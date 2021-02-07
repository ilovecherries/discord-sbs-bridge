import discord, json, aiohttp, asyncio
from discord.webhook import AsyncWebhookAdapter

config = {
    'discord_token': '[REDACTED]',
    'sbs_token': '[REDACTED]',
    'discord_uid': '[REDACTED]',
    'api_url': 'https://smilebasicsource.com/api/'
}

# dictionary to hold all of the channel bindings
channels = {}

client = discord.Client()

async def initial_poll():
    comments_settings = {
        'reverse': True,
        'limit': 1
    }
    url = config['api_url'] + 'Read/chain/?requests=comment-' + json.dumps(comments_settings, separators=(',', ':')) + '&requests=user.0createUserId&content.0parentId'
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return json.loads(await response.text())['comment'][0]['id']

async def send_discord_message(channel_id, comment, userlist):
    def get_sbs_avatar(id):
        return config['api_url'] + 'File/raw/' + str(id) + '?size=128&crop=true'
    user = next(item for item in userlist if item['id'] == comment['createUserId'])
    content = comment['content']
    channel = client.get_channel(int(channel_id))
    webhooks = await channel.webhooks()
    print(webhooks)
    hook = None
    try:
        hook = next(x for x in webhooks if str(x.user.id) == str(client.user.id))
    except StopIteration:
        hook = await channel.create_webhook(name='SmileBASIC Source Bridge')
    if '\n' in content:
        content = content[content.index('\n'):]
    await hook.send(content, username=user['username'], avatar_url=get_sbs_avatar(user['avatar']))

async def poll_messages(last_id):
    listener_settings = {
        'lastId': last_id,
        'chains': ['comment.0id', 'user.1createUserId', 'content.1parentId']
    }
    headers = {
        'Authorization': 'Bearer ' + config['sbs_token']
    }
    url = config['api_url'] + 'Read/listen?actions=' + json.dumps(listener_settings, separators=(',', ':'))
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(url) as response:
                data = json.loads(await response.text())
                last_id = data['lastId']
                data = data['chains']
                userlist = data['user']
                for i in data['comment']:
                    pid = str(i['parentId'])
                    if (i['createDate'] == i['editDate']) and (i['deleted'] == False) and pid in channels.values():
                        for dis_channel, sbs_channel in channels.items():
                            if str(sbs_channel) == str(pid):
                                await send_discord_message(dis_channel, i, userlist)
                return last_id
    except asyncio.exceptions.TimeoutError:
        return last_id
    except json.decoder.JSONDecodeError:
        return last_id

async def send_to_sbs(channel, content):
    message = {
        'parentId': int(channel),
        'content': content
    }
    headers = {
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + config['sbs_token']
    }
    url = config['api_url'] + 'Comment'
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.post(url, data=json.dumps(message)):
            return

@client.event
async def on_ready():
    print('BINDED')

@client.event
async def on_message(message):
    if message.author == client.user:
        return
    elif message.content.startswith('$bind'):
        args = message.content.split(' ')
        if len(args) == 2:
            channels[str(message.channel.id)] = str(args[1])
            await message.channel.send('Successfully binded!')
    elif (str(message.author.id) == str(config['discord_uid'])) and (str(message.channel.id) in channels.keys()):
        await send_to_sbs(channels[str(message.channel.id)], message.content)
        await message.delete()

async def polling():
    await client.wait_until_ready()
    last_id = await initial_poll()
    while True:
        last_id = await poll_messages(last_id)

client.loop.create_task(polling())

client.run(config['discord_token'])

