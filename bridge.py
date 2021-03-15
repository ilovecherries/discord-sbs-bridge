import discord, json, aiohttp, asyncio, requests
import sbs2
from PIL import Image

config = {
    'discord_token': '',
    'sbs_token': '',
    # 'discord_uid': '[PUT DISCORD USER ID IN HERE FOR SINGLE USER MODE]',
    'allow_userbinds': False,
    'allow_discord_messages': True,
    # alternative to using sbs token
    'username': '',
    'password': '',
    'save_location': 'save.json'
}

class DiscordBridge(discord.Client):
    """Discord bot that is bridge between Discord and SmileBASIC Source"""
    def __init__(self, conf):
        super().__init__()
        self.sbs2 = sbs2.SBS2(self.on_sbs_poll)
        if conf['sbs_token'] == '':
            self.sbs2.login(conf['username'], conf['password'])
        else:
            self.sbs2.authtoken = conf['sbs_token']
        self.config = conf
        self.channels = {}

        @self.event
        async def on_message(message):
            if message.author == self.user:
                return
            if message.content.startswith('$bindchat'):
                args = message.content.split()
                if len(args) == 2:
                    self.channels[message.channel.id] = str(args[1])
                    await message.channel.send('Successfully bound channel!')
            elif message.channel.id in self.channels.keys():
                content = message.content
                # adds attachments as links so you can view them in
                # SmileBASIC Source
                for i in message.attachments:
                    content += f'\n!{i.url}'
                # author = self.get_user(message.author.id) 
                content_id = self.channels[message.channel.id]
                content = f'<{message.author.display_name}> {content}'
                await self.sbs2.send_message(content_id, content)

    def load(self):
        """Loads data for the bot"""
        try:
            with open(self.config['save_location'], 'r') as save_file:
                save_data = json.loads(save_file.read())
                self.channels = save_data['channels']
        except FileNotFoundError:
            return

    async def save_loop(self):
        """Infinite loop for saving the bot's data"""
        while True:
            await asyncio.sleep(30)
            with open(self.config['save_location'], 'w') as save_file:
                save_data = {
                    'channels': self.channels,
                }
                save_file.write(json.dumps(save_data))

    def run(self):
        # create the bridge connection to SmileBASIC Source
        self.sbs2.connect()
        self.loop.create_task(self.sbs2.longpoller.run_forever())
        self.loop.create_task(self.save_loop())
        # connect to discord
        super().run(self.config['discord_token'])

    async def on_sbs_poll(self, data):
        """Called whenever a successful poll is made on SmileBASIC Source. We
           filter through the messages here and send them to Discord."""
        userlist = data['user']
        for i in data['comment']:
            pid = str(i['parentId'])
            protect = ('discord_uid' in config)
            protect = protect or (i['createUserId'] != self.sbs2.userid)
            if protect and pid in self.channels.values():
                # ill take care of edited messages later
                if i['createDate'] != i['editDate']:
                    pass
                elif i['deleted'] is False:
                    for d_channel, s_channel in self.channels.items():
                        if str(s_channel) == str(pid):
                            await self.send_discord_message(d_channel, i,
                                                            userlist)

    async def get_webhook(self, channel):
        """Generates or gets a webhook from a channel in order to use as
           as a gateway for SmileBASIC messages to be passed."""
        webhooks = await channel.webhooks()
        try:
            return next(x for x in webhooks
                        if str(x.user.id) == str(client.user.id))
        except StopIteration:
            return await channel.create_webhook(name='SmileBASIC Source Bridge')

    async def send_discord_message(self, channel_id, comment, userlist):
        """Sends a message to Discord given the content provided"""
        user = next(user for user in userlist
                    if user['id'] == comment['createUserId'])
        content = comment['content']
        channel = self.get_channel(int(channel_id))
        avatar = self.sbs2.get_avatar(user['avatar'], 128)
        hook = await self.get_webhook(channel)
        # try to filter the JSON data out of the message
        if '\n' in content:
            try:
                msgdata = json.loads(content[:content.index('\n')])
                content = content[content.index('\n'):]
            except json.decoder.JSONDecodeError:
                pass
        try:
            msg = await hook.send(content, username=user['username'],
                                  avatar_url=avatar, wait=True)
        except discord.errors.HTTPException:
            await channel.send('Sorry, a message didn\'t make it through. ' +
                               'This is likely due to Discord\'s API ' +
                               'restrictions.')

client = DiscordBridge(config)
client.run()
