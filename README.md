# discord-sbs-bridge
 SmileBASIC Source Chat Bridge for Discord

## configuration
.env
```
DISCORD_TOKEN=<PUT_TOKEN_HERE>
SBS_USERNAME=<PUT_USERNAME_HERE>
SBS_PASSWORD=<PUT_PASSWORD_HERE>
SAVE_LOCATION=/save/save.json
```

you can change the save location for testing without docker, but make sure
to change it back to /save/save.json since the volume is mounted at /save

## install
1. install docker and enable services
2. make .env and fill in the fields as shown above 
3. `./prepare-docker.sh`
4. `./start-docker.sh` (also run this if you are starting it again after stopping)

to stop it
```sh
sudo docker stop sbsbridge
```