FROM python:3.11-slim

# Install curl, gnupg, and required tools
RUN apt-get update && apt-get install -y curl gnupg2 apt-transport-https ca-certificates

# Add Microsoft repository GPG keys properly (no apt-key)
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /usr/share/keyrings/microsoft.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release.list

# Install ODBC drivers
RUN apt-get update && \
    ACCEPT_EULA=Y apt-get install -y msodbcsql18 mssql-tools18 unixodbc-dev libgssapi-krb5-2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add mssql-tools to PATH
ENV PATH="$PATH:/opt/mssql-tools18/bin"

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy your code
COPY . .

# Expose port
EXPOSE 8000

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Run FastAPI with startup script
CMD ["/app/start.sh"]
