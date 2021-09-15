sudo docker build --tag discord-sbs-bridge .
sudo docker run -d \
    --mount source=discord-sbs-bridge-volume,target=/save \
    --env-file config.txt \
    discord-sbs-bridge