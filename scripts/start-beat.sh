#!/bin/bash
set -o errexit
set -o pipefail
set -o nounset

export DJANGO_SETTINGS_MODULE=config.settings.local
celery -A config beat --loglevel=info