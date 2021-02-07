import discord, json, aiohttp, asyncio

config = {
    'discord_token': '[REDACTED]',
    'sbs_token': '[REDACTED]',
    # 'discord_uid': '[PUT DISCORD USER ID IN HERE FOR SINGLE USER MODE]',
    'api_url': 'https://smilebasicsource.com/api/'
}

# TODO: images

# dictionary to hold all of the channel bindings
channels = {}
# holds all of the users
users = {}

sbs_id = -1

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

async def get_sbs_id():
    headers = {
        'Authorization': 'Bearer ' + config['sbs_token']
    }
    url = config['api_url'] + 'User/me'
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(url) as response:
            return json.loads(await response.text())['id']

async def send_discord_message(channel_id, comment, userlist):
    def get_sbs_avatar(id):
        return config['api_url'] + 'File/raw/' + str(id) + '?size=128&crop=true'
    user = next(item for item in userlist if item['id'] == comment['createUserId'])
    content = comment['content']
    channel = client.get_channel(int(channel_id))
    webhooks = await channel.webhooks()
    hook = None
    try:
        hook = next(x for x in webhooks if str(x.user.id) == str(client.user.id))
    except StopIteration:
        hook = await channel.create_webhook(name='SmileBASIC Source Bridge')
    if '\n' in content:
        try:
            msgdata = json.loads(content[:content.index('\n')])
            content = content[content.index('\n'):]
        except json.decoder.JSONDecodeError:
            pass
    try:
        await hook.send(content, username=user['username'], avatar_url=get_sbs_avatar(user['avatar']))
    except discord.errors.HTTPException:
        await channel.send('Sorry, a message couldn\'t make it through. Possibly due to a limitation in Discord\'s API.')

async def poll_messages(last_id):
    global sbs_id
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
                    protect_self = ('discord_uid' in config) or (i['createUserId'] != sbs_id)
                    if protect_self and (i['createDate'] == i['editDate']) and (i['deleted'] == False) and pid in channels.values():
                        items = channels.items()
                        for dis_channel, sbs_channel in items:
                            if str(sbs_channel) == str(pid):
                                await send_discord_message(dis_channel, i, userlist)
                return last_id
    except asyncio.exceptions.TimeoutError:
        return last_id
    except json.decoder.JSONDecodeError:
        return last_id

async def send_to_sbs(channel, content, user_token):
    message = {
        'parentId': int(channel),
        'content': content
    }
    headers = {
        'Content-Type': 'application/json', 
        'Authorization': 'Bearer ' + user_token 
    }
    url = config['api_url'] + 'Comment'
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.post(url, data=json.dumps(message)):
            return

@client.event
async def on_ready():
    print('BINDED')
    global sbs_id
    sbs_id = await get_sbs_id()

@client.event
async def on_message(message):
    if message.author == client.user:
        return
    elif message.content.startswith('$bindchat'):
        args = message.content.split(' ')
        if len(args) == 2:
            channels[str(message.channel.id)] = str(args[1])
            await message.channel.send('Successfully bound channel!')
    elif (not 'discord_uid' in config) and message.content.startswith('$binduser'):
        args = message.content.split(' ')
        await message.delete()
        if len(args) == 2:
            users[str(message.author.id)] = str(args[1])
            await message.author.send('Successfully bound user!')
    elif (str(message.channel.id) in channels.keys()):
        # for single-user use
        if 'discord_uid' in config:
            if config['discord_uid'] == str(message.author.id):
                await send_to_sbs(channels[str(message.channel.id)], message.content, config['sbs_token'])
                await message.delete()
        elif (str(message.author.id) in users.keys()):
            await send_to_sbs(channels[str(message.channel.id)], message.content, users[str(message.author.id)])
            await message.delete()
        else:
            webhooks = await message.channel.webhooks()
            async def send_anon_message():
                await send_to_sbs(channels[str(message.channel.id)], "<" + message.author.name + "> " + message.content, config['sbs_token'])
            try:
                hook = next(x for x in webhooks if str(x.user.id) == str(client.user.id))
                if not (hook.id == message.author.id):
                    await send_anon_message()
            except StopIteration:
                await send_anon_message()

async def polling():
    await client.wait_until_ready()
    last_id = await initial_poll()
    while True:
        last_id = await poll_messages(last_id)

client.loop.create_task(polling())

client.run(config['discord_token'])

