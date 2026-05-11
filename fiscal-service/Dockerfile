FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.json
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader \
  --ignore-platform-req=ext-soap --ignore-platform-req=ext-gd --ignore-platform-req=ext-zip

FROM php:8.3-apache
WORKDIR /var/www/html

RUN apt-get update \
  && apt-get install -y --no-install-recommends libxml2-dev libzip-dev zlib1g-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev \
  && docker-php-ext-configure gd --with-freetype --with-jpeg \
  && docker-php-ext-install soap zip gd \
  && a2enmod rewrite headers \
  && rm -rf /var/lib/apt/lists/*

COPY --from=vendor /app/vendor /var/www/html/vendor
COPY public /var/www/html/public
COPY src /var/www/html/src
COPY config /var/www/html/config

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

EXPOSE 8080
ENV PORT=8080
CMD ["sh", "-c", "sed -i \"s/Listen 80/Listen ${PORT}/\" /etc/apache2/ports.conf && apache2-foreground"]
