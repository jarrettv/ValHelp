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

WORKDIR /config

COPY entrypoint.sh /entrypoint.sh
RUN sed -i '1s/^\xEF\xBB\xBF//' /entrypoint.sh \
	&& sed -i 's/\r$//' /entrypoint.sh \
	&& chmod +x /entrypoint.sh \
	&& head -n 1 /entrypoint.sh | grep -q '^#!' \
	&& grep -q 'pgsync' /entrypoint.sh

ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
