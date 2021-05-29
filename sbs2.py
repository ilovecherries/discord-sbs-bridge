"""Provides an interface to SmileBASIC Source 2"""

import json
import asyncio
import aiohttp
import simplejson
import requests

class SBS2MessageLongPoller:
    """
    Creates a message long poller that infinitely loops forever until it is
    destroyed. It will initially poll for one message for the first ID, then
    use it in order to infinitely keep polling for messages.
    In order to use it correctly, I would recommend doing the following steps:
    1. Instantiating a LongPoller object for your client instance.
    2. Create a new Thread and then set the target to the run_forever()
       function
    """
    def __init__(self, api_url, callback, authtoken):
        self.api_url = api_url
        self.callback = callback
        self.authtoken = authtoken
        self.loop = asyncio.new_event_loop()
        # create an initial poll in order to get the last ID sent
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

    async def run_forever(self, client):
        """Infinite event loop that will send data if successful
           The CLIENT is a discord.py related thing and can be removed
           for other applications that might use this wrapper."""
        await client.wait_until_ready()
        headers={'Authorization': f'Bearer {self.authtoken}'}
        async with aiohttp.ClientSession(headers=headers) as session:
            while True:
                listener_settings = {
                    'lastId': self.last_id,
                    'chains': ['comment.0id', 'user.1createUserId',
                               'content.1parentId']
                }
                url = f"{self.api_url}Read/listen?actions="
                url += json.dumps(listener_settings, separators=(',', ':'))

                try:
                    async with session.get(url) as response:
                        data = json.loads(await response.text())
                        self.last_id = data['lastId']
                        await self.callback(data['chains'])
                except Exception as e:
                    continue

class SBS2:
    """Client representing connection to SmileBASIC Source 2
       Once connected with connect(), you'll want to add 
       sbs2.longpoller.run_forever()
       to the main asyncio loop. If you do not already have one, read here
       on how to make one:
       https://www.aeracode.org/2018/02/19/python-async-simplified/"""
    def __init__(self, on_successful_pull, authtoken=''):
        self.api_url = 'https://smilebasicsource.com/api/'
        self.userid = 0
        self.authtoken = authtoken
        self.longpoller = None
        self.on_successful_pull = on_successful_pull

    def login(self, username, password):
        """Gets the auth token from the API and saves it"""
        result = requests.post(self.api_url + 'User/authenticate',
            json={
                'username': username,
                'password': password
            }
        )

        self.authtoken = result.text

    def connect(self):
        """Starts polling from website in infinite loop"""
        if not self.authtoken:
            raise Exception()

        # for self-identification
        selfuser = requests.get(
            f'{self.api_url}User/me',
            headers={'Authorization': f'Bearer {self.authtoken}'}
        ).json()
        self.userid = selfuser['id']

        self.longpoller = SBS2MessageLongPoller(
            self.api_url,
            self.on_successful_pull,
            self.authtoken
        )

    async def send_message(self, room_id, content, settings=None):
        """Sends a message to SmileBASIC Source given the room ID and content"""
        settings = settings or {}
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.authtoken}'
        }
        message={
            'parentId': int(room_id),
            'content': json.dumps(settings)+'\n'+content
        }
        url = f'{self.api_url}Comment'
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.post(url, data=json.dumps(message)):
                return

    def get_avatar(self, avatar_id, size):
        """Returns a link to the avatar on SmileBASIC Source, provided by
           the ID included in the user object."""
        return f'{self.api_url}File/raw/{avatar_id}?size={size}&crop=true'
