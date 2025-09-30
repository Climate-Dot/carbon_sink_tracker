#!/bin/bash
set -e

# Install dependencies
apt-get update && apt-get install -y curl gnupg2 apt-transport-https software-properties-common

# Add Microsoft repo
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list
apt-get update

# Install ODBC driver
ACCEPT_EULA=Y apt-get install -y msodbcsql18

# Optional: unixODBC dev headers
apt-get install -y unixodbc-dev

echo "✅ ODBC Driver installed successfully."
