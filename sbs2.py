"""Provides an interface to SmileBASIC Source 2"""

import json
import asyncio
import aiohttp
import simplejson
import requests

class SBS2:
    """Client representing connection to SmileBASIC Source 2
       Once connected with connect(), you'll want to add 
       sbs2.longpoller.run_forever()
       to the main asyncio loop. If you do not already have one, read here
       on how to make one:
       https://www.aeracode.org/2018/02/19/python-async-simplified/"""
    def __init__(self, on_successful_pull, authtoken='', username='',
                 password=''):
        self.api_url = 'https://smilebasicsource.com/api/'
        self.userid = 0
        self.authtoken = authtoken
        self.longpoller = None
        self.on_successful_pull = on_successful_pull
        self.loop = asyncio.new_event_loop()
        self.username = username
        self.password = password
        self.last_id = -1

    async def run_forever(self, client):
        """Infinite event loop that will send data if successful
           The CLIENT is a discord.py related thing and can be removed
           for other applications that might use this wrapper."""
        await client.wait_until_ready()
        headers={'Authorization': f'Bearer {self.authtoken}'}
        rate_limited = False
        async with aiohttp.ClientSession(headers=headers) as session:
            while True:
                listener_settings = {
                    'lastId': self.last_id,
                    'chains': ['comment.0id', 'user.1createUserId',
                               'content.1parentId']
                }
                url = f"{self.api_url}Read/listen?actions="
                url += json.dumps(listener_settings, separators=(',', ':'))

                if rate_limited:
                    await asyncio.sleep(3)
                    rate_limited = False

                try:
                    async with session.get(url) as response:
                        status = response.status
                        data = json.loads(await response.text())
                        if status == 200:
                            self.last_id = data['lastId']
                            await self.on_successful_pull(data['chains'])
                        elif status == 401: # invalid auth
                            print('attempting to refresh auth')
                            self.login()
                        elif status == 429: # ratelimited
                            print('rate limited')
                            rate_limited = True

                except Exception as e:
                    continue

    def login(self):
        """Gets the auth token from the API and saves it"""
        result = requests.post(self.api_url + 'User/authenticate',
            json={
                'username': self.username,
                'password': self.password
            }
        )

        self.authtoken = result.text

    def connect(self):
        """Starts polling from website in infinite loop"""
        if not self.authtoken:
            self.login()

        # for self-identification
        selfuser = requests.get(
            f'{self.api_url}User/me',
            headers={'Authorization': f'Bearer {self.authtoken}'}
        ).json()
        self.userid = selfuser['id']

        comments_settings = {
            'reverse': True,
            'limit': 1
        }
        headers={'Authorization': f'Bearer {self.authtoken}'}
        data = {}
        result = requests.get(
            f'{self.api_url}Read/chain/?requests=comment-' +
            json.dumps(comments_settings, separators=(',', ':')) +
            '&requests=user.0createUserId&content.0parentId',
            headers=headers
        )
        data = result.json()
        self.last_id = data['comment'][0]['id']
        

    def get_headers(self):
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.authtoken}'
        }

    async def send_message(self, room_id, content, settings=None):
        """Sends a message to SmileBASIC Source given the room ID and content"""
        settings = settings or {}
        settings.update({'m': '12y'})
        headers = self.get_headers()
        message={
            'parentId': int(room_id),
            'content': json.dumps(settings)+'\n'+content
        }
        url = f'{self.api_url}Comment'
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.post(url, data=json.dumps(message)) as response:
                data = await response.json()
                return data['id']

    async def edit_message(self, message_id, content, settings=None):
        settings = settings or {}
        settings.update({'m': '12y'})
        headers  = self.get_headers()
        message={
            'content': json.dumps(settings)+'\n'+content
        }
        url = f'{self.api_url}Comment/{message_id}'

        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.put(url, data=json.dumps(message)):
                return

    async def delete_message(self, message_id):
        headers  = self.get_headers()
        url = f'{self.api_url}Comment/{message_id}'
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.delete(url):
                return

    def get_avatar(self, avatar_id, size):
        """Returns a link to the avatar on SmileBASIC Source, provided by
           the ID included in the user object."""
        return f'{self.api_url}File/raw/{avatar_id}?size={size}&crop=true'
