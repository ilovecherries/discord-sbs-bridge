import discord, json, requests, aiohttp, asyncio
from discord.webhook import AsyncWebhookAdapter

config = {
    'discord_token': '[REDACTED]',
    'sbs_token': '[REDACTED]',
    'discord_channel': '[REDACTED]',
    'discord_uid': '[REDACTED]',
    'sbs_channel': 937,
    'webhook_url': '[REDACTED]',
    'api_url': 'https://smilebasicsource.com/api/'
}

def get_sbs_avatar(id):
    return config['api_url'] + 'File/raw/' + str(id) + '?size=128&crop=true'

client = discord.Client()

async def initial_poll():
    comments_settings = {
        'parentIds': [config['sbs_channel']],
        'reverse': True,
        'limit': 1
    }
    url = config['api_url'] + 'Read/chain/?requests=comment-' + json.dumps(comments_settings, separators=(',', ':')) + '&requests=user.0createUserId&content.0parentId'
    response = json.loads(requests.get(url).text)
    comments = response['comment']
    channel = client.get_channel(int(config['discord_channel']))
    await send_sbs_message(comments[0], response['user'])
    return comments[0]['id']

async def send_sbs_message(comment, userlist):
    user = next(item for item in userlist if item['id'] == comment['createUserId'])
    content = comment['content']
    if '\n' in content:
        content = content[content.index('\n'):]
    async with aiohttp.ClientSession() as session:
        webhook = discord.Webhook.from_url(config['webhook_url'], adapter=AsyncWebhookAdapter(session))
        await webhook.send(content, username=user['username'], avatar_url=get_sbs_avatar(user['avatar']))

async def poll_messages(last_id):
    listener_settings = {
        'lastId': last_id,
        'chains': ['comment.0id', 'user.1createUserId', 'content.1parentId']
    }
    url = config['api_url'] + 'Read/listen?actions=' + json.dumps(listener_settings, separators=(',', ':'))
    try:
        async with aiohttp.ClientSession(headers={'Authorization': 'Bearer ' + config['sbs_token']}) as session:
            async with session.get(url) as response:
                data = json.loads(await response.text())['chains']
                userlist = data['user']
                for i in data['comment']:
                    if int(i['parentId']) == config['sbs_channel']:
                        await send_sbs_message(i, userlist)
                return data['comment'][-1]['id']
    except asyncio.exceptions.TimeoutError:
        return last_id
    except json.decoder.JSONDecodeError:
        return last_id

async def send_to_sbs(content):
    message = {
        'parentId': int(config['sbs_channel']),
        'content': content
    }
    headers = {
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + config['sbs_token']
    }
    url = config['api_url'] + 'Comment'
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.post(url, data=json.dumps(message)) as response:
            return

@client.event
async def on_ready():
    print('BINDED')

@client.event
async def on_message(message):
    if message.author == client.user:
        return
    elif str(message.author.id) == str(config['discord_uid']):
        content = message.content
        await message.delete()
        await send_to_sbs(content)

async def polling():
    await client.wait_until_ready()
    last_id = await initial_poll()
    while True:
        last_id = await poll_messages(last_id)

client.loop.create_task(polling())

client.run(config['discord_token'])

