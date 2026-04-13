FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY seedgen.csproj ./
COPY *.cs ./
COPY WorldGen/ ./WorldGen/
COPY Rendering/ ./Rendering/
RUN dotnet restore
RUN dotnet publish -c Release -o /app

FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 libpulse0 libsdl2-2.0-0 ca-certificates \
    lib32gcc-s1 curl \
    && rm -rf /var/lib/apt/lists/*

# SteamCMD (for updating the server at runtime)
RUN mkdir -p /steamcmd && cd /steamcmd \
    && curl -sqL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar xzf -

# .NET 9 runtime
COPY --from=build /usr/share/dotnet /usr/share/dotnet
ENV DOTNET_ROOT=/usr/share/dotnet
ENV PATH="$PATH:/usr/share/dotnet"

# Valheim server lives on a volume — updated at startup if needed
ENV VALHEIM_SERVER_DIR=/valheim

# seedgen tool
COPY --from=build /app /app

COPY entrypoint.sh /entrypoint.sh
COPY update-server.sh /update-server.sh
RUN chmod +x /entrypoint.sh /update-server.sh

EXPOSE 5580

# Default: update Valheim server if needed, then start HTTP API + worker
CMD ["/bin/bash", "-c", "/update-server.sh && dotnet /app/seedgen.dll serve"]
