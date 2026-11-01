# Retain the exact PHP and NFePHP runtime currently published; no dependency refresh.
ARG FISCAL_RUNTIME_IMAGE=us-central1-docker.pkg.dev/crmdoceria-9959e/cloud-run-source-deploy/ana-guimaraes-fiscal-service@sha256:20cd32576a6823dc79053f7062883b9ee5482aeb92d103af485cafc5d9104e60
FROM ${FISCAL_RUNTIME_IMAGE}
WORKDIR /var/www/html
RUN docker-php-ext-install bcmath
COPY public /var/www/html/public
COPY src /var/www/html/src
COPY config /var/www/html/config
COPY tests /var/www/html/tests
RUN find public src tests -name '*.php' -exec php -l {} \; \
  && php tests/PayloadValidatorTest.php \
  && php tests/FreightXmlTest.php
