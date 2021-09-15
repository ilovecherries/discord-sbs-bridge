# discord-sbs-bridge
 SmileBASIC Source Chat Bridge for Discord

## install
1. install docker and enable services
2. make config.txt and fill in the field provided in exampleconfig.txt
3. `./prepare-docker.sh`
4. `./start-docker.sh` (also run this if you are starting it again after stopping)

to stop it
```sh
sudo docker stop sbsbridge
```