sudo docker build --tag discord-sbs-bridge .
sudo docker run -d \
    --mount source=discord-sbs-bridge-volume,target=/save \
    --env-file .env \
    discord-sbs-bridge