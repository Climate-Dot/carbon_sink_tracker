#!/bin/bash

echo "🚀 Starting Carbon Sink Tracker..."

# Wait a moment for the container to fully initialize
sleep 2

# Test database connection before starting the app
echo "🔗 Testing database connection..."
python -c "
import os
import pyodbc
from dotenv import load_dotenv

load_dotenv('Backend/credentials.env')

try:
    conn_str = (
        f'DRIVER={{ODBC Driver 18 for SQL Server}};'
        f'SERVER={os.getenv(\"DB_HOST\")},{os.getenv(\"DB_PORT\")};'
        f'DATABASE={os.getenv(\"DB_NAME\")};'
        f'UID={os.getenv(\"DB_USER\")};'
        f'PWD={os.getenv(\"DB_PASSWORD\")};'
        'Encrypt=YES;'
        'TrustServerCertificate=NO;'
        'Connection Timeout=30;'
    )
    conn = pyodbc.connect(conn_str, timeout=30)
    conn.close()
    print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
    exit(1)
"

if [ $? -eq 0 ]; then
    echo "✅ Starting FastAPI server..."
    uvicorn Backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
else
    echo "❌ Failed to connect to database. Exiting."
    exit 1
fi
