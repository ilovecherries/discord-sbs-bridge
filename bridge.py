#!/usr/bin/env python3

"""SmileBASIC Source-Discord Bridge"""

import json
import asyncio
import discord
import requests
from PIL import Image
from collections import OrderedDict
import sbs2
import os
from lru import LRU

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
        self.avatars = {}
        # save messages from sbs to discord
        self.sbs_msgs = LRU(1000)
        # TODO: save messages from discord to sbs
        self.dis_msgs = LRU(1000)

        @self.event
        async def on_message_edit(before, after):
            if self.dis_msgs.has_key(before.id):
                content = after.content
                # adds attachments as links so you can view them in
                # SmileBASIC Source
                for i in after.attachments:
                    content += f'\n!{i.url}'
                # author = self.get_user(message.author.id)
                message_id = self.dis_msgs[before.id]
                try:
                    hook = next(x for x in await after.channel.webhooks()
                                if x.user.id == self.user.id)
                    if not hook.id == after.author.id:
                        settings = {
                            'a': self.get_discord_avatar(after.author),
                            'b': after.author.display_name
                        }
                        await self.sbs2.edit_message(message_id,
                                                               content,
                                                               settings)
                except StopIteration:
                    await self.sbs2.edit_message(message_id, content)

        @self.event
        async def on_message_delete(message):
            if self.dis_msgs.has_key(message.id):
                await self.sbs2.delete_message(self.dis_msgs[message.id])

        @self.event
        async def on_message(message):
            if message.author == self.user:
                return
            if message.content.startswith('$bindchat'):
                args = message.content.split()
                if len(args) == 2:
                    self.channels[str(message.channel.id)] = str(args[1])
                    await message.channel.send('Successfully bound channel!')
            elif message.content.startswith('$unbindchat'):
                if self.channels[str(message.channel.id)]:
                    del self.channels[str(message.channel.id)]
                    await message.channel.send('Successfully unbound channel!')
            elif str(message.channel.id) in self.channels.keys():
                # webhooks are something special and will circumvent
                # perms to be able to ping people XD
                content = message.content
                # adds attachments as links so you can view them in
                # SmileBASIC Source
                for i in message.attachments:
                    content += f'\n!{i.url}'
                # author = self.get_user(message.author.id)
                content_id = int(self.channels[str(message.channel.id)])
                sent_id = -1
                try:
                    hook = next(x for x in await message.channel.webhooks()
                                if x.user.id == self.user.id)
                    if not hook.id == message.author.id:
                        settings = {
                            'a': self.get_discord_avatar(message.author),
                            'b': message.author.display_name
                        }
                        sent_id = await self.sbs2.send_message(content_id,
                                                               content,
                                                               settings)
                except StopIteration:
                    sent_id = await self.sbs2.send_message(content_id, content)
                if sent_id != -1:
                    self.dis_msgs[message.id] = sent_id

    def load(self):
        """Loads data for the bot"""
        try:
            with open(os.path.dirname(os.path.abspath(__file__)) + '/' +
                      self.config['save_location'], 'r') as save_file:
                save_data = json.loads(save_file.read())
                self.channels = save_data['channels']
                self.avatars = save_data['avatars']
        except FileNotFoundError:
            return

    async def save_loop(self):
        """Infinite loop for saving the bot's data"""
        while True:
            await asyncio.sleep(30)
            with open(os.path.dirname(os.path.abspath(__file__)) + '/' +
                      self.config['save_location'], 'w') as save_file:
                save_data = {
                    'channels': self.channels,
                    'avatars': self.avatars
                }
                save_file.write(json.dumps(save_data))

    def run(self):
        # create the bridge connection to SmileBASIC Source
        self.load()
        self.sbs2.connect()
        self.loop.create_task(self.sbs2.run_forever(self))
        self.loop.create_task(self.save_loop())
        # send a message in the console confirming that it is connected
        print('Running!')
        # connect to discord
        super().run(self.config['discord_token'])

    async def on_sbs_poll(self, data):
        """Called whenever a successful poll is made on SmileBASIC Source. We
           filter through the messages here and send them to Discord."""
        userlist = data['user']
        # We limit it down to 5 messages per poll for in case the bot loses
        # internet connection and starts spamming Discord with a bunch of
        # messages
        for i in data['comment'][-5:]:
            pid = str(i['parentId'])
            protect = i['createUserId'] != self.sbs2.userid
            mid = i['id']
            content = i['content']
            settings = {}
            # try to filter the JSON data out of the message
            if '\n' in content:
                try:
                    settings = json.loads(content[:content.index('\n')])
                    content = content[content.index('\n'):]
                except json.decoder.JSONDecodeError:
                    pass
            i['content'] = content
            if protect and pid in self.channels.values():
                if i['deleted'] is True:
                    try:
                        if self.sbs_msgs.has_key(mid):
                            await self.sbs_msgs[mid].delete()
                    except Exception as e:
                        pass
                elif i['createDate'] != i['editDate']:
                    try:
                        if self.sbs_msgs.has_key(mid):
                            await self.sbs_msgs[mid].edit(content=i['content'])
                    except Exception as e:
                        pass
                elif i['deleted'] is False:
                    for d_channel, s_channel in self.channels.items():
                        if str(s_channel) == str(pid):
                            await self.send_discord_message(str(d_channel), i,
                                                            settings, userlist)

    async def get_webhook(self, channel):
        """Generates or gets a webhook from a channel in order to use as
           as a gateway for SmileBASIC messages to be passed."""
        webhooks = await channel.webhooks()
        try:
            return next(x for x in webhooks
                        if str(x.user.id) == str(client.user.id))
        except StopIteration:
            return await channel.create_webhook(name='SmileBASIC Source Bridge')

    async def send_discord_message(self, channel_id, comment, settings, userlist):
        """Sends a message to Discord given the content provided"""
        user = next(user for user in userlist
                    if user['id'] == comment['createUserId'])
        content = comment['content']
        channel = self.get_channel(int(channel_id))
        avatar = self.sbs2.get_avatar(user['avatar'], 128)
        hook = await self.get_webhook(channel)
        try:
            content = content.replace('@', '@\u200b')
            msg = await hook.send(content, username=user['username'],
                            avatar_url=avatar, wait=True)
            self.sbs_msgs[comment['id']] = msg
        except discord.errors.HTTPException:
            await channel.send('Sorry, a message didn\'t make it through. ' +
                               'This is likely due to Discord\'s API ' +
                               'restrictions.')

    def get_discord_avatar(self, author):
        """Gets the SmileBASIC Source file ID for your Discord avatar"""
        url = str(author.avatar_url)
        aid = str(author.id)
        doesnt_exist = str(author.id) not in self.avatars.keys()
        doesnt_exist = doesnt_exist or str(self.avatars[aid][0]) != url

        if doesnt_exist:
            headers = {'Authorization': f'Bearer {self.sbs2.authtoken}'}
            response = requests.get(author.avatar_url)
            imgdir = os.path.dirname(os.path.abspath(__file__))
            imgdir += '/img'
            filename = f'{imgdir}{author.id}.'
            if not os.path.exists(imgdir):
                os.mkdir(imgdir)
            with open(filename+'webp', 'wb') as file:
                file.write(response.content)
            img = Image.open(filename+'webp').convert('RGB')
            img.save(filename+'png', 'png')
            file = {'file': open(filename+'png', 'rb')}
            data = requests.post(self.sbs2.api_url + 'File',
                                 headers=headers, files=file).text
            self.avatars[str(author.id)] = [str(author.avatar_url),
                                            str(json.loads(data)['id'])]
        return int(self.avatars[str(author.id)][1])


if __name__ == "__main__":
    with open(os.path.dirname(os.path.abspath(__file__)) +
              '/config.json', 'r') as file:
        config = json.loads(file.read())
        client = DiscordBridge(config)
        client.run()
