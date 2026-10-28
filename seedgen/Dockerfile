FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY seedgen.csproj ./
COPY *.cs ./
COPY WorldGen/ ./WorldGen/
COPY Vh.WorldGen/ ./Vh.WorldGen/

RUN dotnet restore
RUN dotnet publish -c Release -o /app

# ── worldgen oracle plugin (optional) ────────────────────────────────────────
# Built against the game + BepInEx assemblies, which are not in this image, so
# the DLL is built on the host and copied in. See seedgen/oracle/README.md.
# Absent is fine: oracle jobs then fail with a clear message and ordinary POI
# generation is unaffected.
FROM scratch AS oracle
COPY oracle/bin/Release/ValHelpOracle.dl[l] /

FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 libpulse0 libsdl2-2.0-0 ca-certificates \
    lib32gcc-s1 curl unzip \
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

# BepInEx version installed into the server dir by install-bepinex.sh.
ENV BEPINEX_VERSION=5.4.2202

# seedgen tool
COPY --from=build /app /app

# Oracle plugin, staged for install-bepinex.sh to drop into BepInEx/plugins.
COPY --from=oracle / /app/oracle/

COPY update-server.sh /update-server.sh
COPY install-bepinex.sh /install-bepinex.sh
RUN chmod +x /update-server.sh /install-bepinex.sh

EXPOSE 5580

# Update the server, (re)install BepInEx + the oracle plugin over it, then serve.
# BepInEx is inert unless a job sets DOORSTOP_ENABLED, so this costs nothing for
# ordinary POI jobs — but it must run after update-server.sh, because
# `app_update ... validate` can clobber files under the server dir.
CMD ["/bin/bash", "-c", "/update-server.sh && /install-bepinex.sh && dotnet /app/seedgen.dll serve"]
