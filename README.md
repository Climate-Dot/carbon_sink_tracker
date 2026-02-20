# Carbon Sink Tracker

A FastAPI-based API for tracking carbon sink data, with SQL Server and Azure Blob Storage integration.

## Prerequisites

- **Python 3.11+**
- **SQL Server** (Azure SQL or local) with ODBC Driver 18
- **Azure Blob Storage** account (for LULC data)
- **Docker** (optional, for containerized runs)

## Environment Setup

Create `Backend/credentials.env` with the following variables:

```env
# Database (Azure SQL or SQL Server)
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_HOST=your_host.database.windows.net
DB_PORT=1433

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=your_connection_string
AZURE_STORAGE_CONTAINER=your_container_name

# Optional
LULC_BLOB_PREFIX=lulc
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
```

> **Note:** Copy `Backend/credentials.env.example` to `Backend/credentials.env` and fill in your values. Do not commit `credentials.env` to version control.

---

## Running Locally

### 1. Create a virtual environment

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the application

From the project root:

```bash
uvicorn Backend.main:app --host 0.0.0.0 --port 8000
```

The API will be available at **http://localhost:8000**.

- **API docs (Swagger):** http://localhost:8000/docs  
- **ReDoc:** http://localhost:8000/redoc  

---

## Running with Docker

### Build the image

```bash
docker build -t carbon-sink .
```

### Run the container

Use `credentials.env` as an env file and expose the API port:

```bash
docker run -d \
  --name carbon-sink \
  -p 8000:8000 \
  --env-file Backend/credentials.env \
  carbon-sink
```

**PowerShell:**

```powershell
docker run -d `
  --name carbon-sink `
  -p 8000:8000 `
  --env-file Backend/credentials.env `
  carbon-sink
```

**macOS/Linux:**

```bash
docker run -d \
  --name carbon-sink \
  -p 8000:8000 \
  --env-file Backend/credentials.env \
  carbon-sink
```

### Alternative: Use env file

```bash
docker run -d \
  --name carbon-sink \
  -p 8000:8000 \
  --env-file Backend/credentials.env \
  carbon-sink
```

### Stop and remove

```bash
docker stop carbon-sink
docker rm carbon-sink
```

---

## Debugging with Cursor/VS Code

### Local debugging

1. Open the project in Cursor.
2. Set breakpoints in `Backend/main.py` or other modules.
3. Press **F5** or use **Run > Start Debugging**.
4. Choose **"Python: FastAPI"** or **"Python: Current File"** if needed.

### Docker debugging

Use Docker launch configuration in Cursor/VS Code (not manual attach). `Dockerfile.local` is a standalone debug image.

1. **Start Docker debug from the IDE:**
   - Press **F5** or use **Run > Start Debugging**.
   - Select **"Docker: FastAPI (Launch)"**.
   - This runs `docker-run: debug`, which automatically:
     - builds `carbon-sink-debug:dev` using `Dockerfile.local`
     - pre-cleans old `carbon-sink-debug` container
     - starts container with `Backend/credentials.env` passed via `--env-file`

2. **Equivalent CLI (manual):**

   ```bash
   docker rm -f carbon-sink-debug
   docker build -t carbon-sink-debug:dev -f Dockerfile.local .
   docker run -d \
     --name carbon-sink-debug \
     -p 8000:8000 \
     --env-file Backend/credentials.env \
     -v "$(pwd):/app" \
     carbon-sink-debug:dev
   ```

3. Set breakpoints and trigger API requests. Execution pauses at your breakpoints.

### Debug configuration files

- **`.vscode/launch.json`** – Debug configurations (local FastAPI, Docker launch).
- **`.vscode/tasks.json`** – Tasks for building and running the Docker image.

---

## Project Structure

```
CarbonSink/
├── Backend/
│   ├── main.py           # FastAPI application
│   ├── blob_storage.py   # Azure Blob Storage helpers
│   ├── credentials.env   # Environment variables (create from .example)
│   └── ...
├── Database/             # Database scripts
├── requirements.txt
├── Dockerfile            # Production image
├── Dockerfile.local      # Standalone debug image (with debugpy)
├── start.sh              # Container startup script
├── start-debug.sh        # Optional script for manual debugpy attach workflow
└── README.md
```

---

## Troubleshooting

### Database connection fails

- Ensure SQL Server allows your IP (Azure: add firewall rule).
- Verify ODBC Driver 18 is installed: `odbcinst -q -d`.
- Check `DB_HOST`, `DB_PORT`, and credentials in `credentials.env`.

### Azure Blob Storage errors

- Confirm `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER` are set.
- Ensure the container exists or that the app has permission to create it.

### Docker: "credentials.env not found"

- Create `Backend/credentials.env` before running.
- Use the correct mount path for your OS (see examples above).
