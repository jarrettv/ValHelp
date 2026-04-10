FROM ruby:3.3-alpine

# pgsync uses the pg gem and Postgres client tools
RUN apk add --no-cache \
	bash \
	ca-certificates \
	tzdata \
	postgresql-client \
	postgresql-dev \
	build-base

RUN gem install pgsync -N

# Python for bespoke track_maps sync (blobs too large for pgsync bulk COPY)
RUN apk add --no-cache python3 py3-psycopg2

WORKDIR /config

COPY sync_track_maps.py /scripts/sync_track_maps.py
COPY entrypoint.sh /entrypoint.sh
RUN sed -i '1s/^\xEF\xBB\xBF//' /entrypoint.sh \
	&& sed -i 's/\r$//' /entrypoint.sh \
	&& chmod +x /entrypoint.sh \
	&& head -n 1 /entrypoint.sh | grep -q '^#!' \
	&& grep -q 'pgsync' /entrypoint.sh

ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
