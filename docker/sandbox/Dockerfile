# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 The Agentrail Authors

FROM python:3.12-slim

# System tools
RUN apt-get update && apt-get install -y \
    bash curl git ripgrep \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright browsers to a fixed global path accessible by all users
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN npm install -g playwright \
    && npx playwright install chromium --with-deps \
    && npm uninstall -g playwright \
    && chmod -R a+rx /opt/playwright-browsers

# Browser sidecar server
COPY browser-server/ /opt/browser-server/
RUN cd /opt/browser-server && npm install --omit=dev

# LibreOffice — xlsx formula recalculation (recalc.py) + docx PDF conversion (soffice.py)
# pandoc — docx text extraction
RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

# Python deps for spreadsheet skills and deep research processing
RUN pip install --no-cache-dir \
    pandas \
    numpy \
    matplotlib \
    seaborn \
    python-dateutil \
    openpyxl \
    defusedxml \
    lxml

# docx npm package — create Word documents (docx skill)
RUN npm install -g docx

# Sandbox user (non-root)
RUN useradd -m -u 1000 sandbox
RUN mkdir -p /workspace && chown sandbox:sandbox /workspace

USER sandbox
WORKDIR /workspace

EXPOSE 8080
