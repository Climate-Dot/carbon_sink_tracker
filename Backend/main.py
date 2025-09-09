# ==========================
# Standard Library Imports
# ==========================
from contextlib import asynccontextmanager          # For FastAPI lifespan management
import json                                        # For working with JSON data
import os                                          # For environment variables and paths
import time    
import asyncio# For performance measurement / debugging

# ==========================
# Third-Party Imports
# ==========================
from dotenv import load_dotenv                     # For loading environment variables from .env file
from fastapi import FastAPI, Query, HTTPException  # FastAPI core and request handling
from fastapi.middleware.cors import CORSMiddleware # Middleware to allow cross-origin requests
from fastapi.responses import JSONResponse, FileResponse  # For structured API responses and serving files
import pyodbc                                      # For SQL Server database connection
from shapely import wkt, wkb                        # For parsing WKT geometries
from shapely.geometry import mapping                     # For converting geometries to GeoJSON
# ==========================

# ==========================
# FastAPI App
# Create the API; state is populated during lifespan startup
# ==========================
print("Starting up...")

# ==========================
# Load Environment Variables
# ==========================
# Load DB credentials from local env file when running locally
load_dotenv(os.path.join(os.getcwd(), "Backend", "credentials.env"))

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")


# ==========================
# Database Connection Helper
# ==========================
def get_connection():
    """Create and return a SQL Server connection using pyodbc.

    Reads host, port, database, and credentials from environment variables
    prepared by load_dotenv above or the deployment environment.
    """
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={DB_HOST},{DB_PORT};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "Encrypt=YES;"
        "TrustServerCertificate=NO;"
        "Connection Timeout=90;"
    )
    return pyodbc.connect(conn_str)

# def get_connection():
#     return pymssql.connect(
#         server=DB_HOST,
#         port=DB_PORT,
#         user=DB_USER,
#         password=DB_PASSWORD,
#         database=DB_NAME,
#         tds_version='8.0',  # optional
#     )

# ==========================
# Lifespan Context for Startup
# Preloads relatively small metadata eagerly and heavy datasets in background.
# ==========================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler.

    On startup:
      - Connects to the database
      - Loads state and district boundaries and names
      - Loads available years
      - Kicks off background task to load heavier LULC preview
    On shutdown:
      - Logs shutdown (connections are closed where opened)
    """
    print("🔗 Connecting to database...")
    conn = get_connection()
    cur = conn.cursor()

    # Load small/essential metadata synchronously
    start_time = time.time()
    print("🌍 Loading state boundaries from DB...")
    cur.execute("SELECT name, geom.STAsText() FROM state_boundaries ORDER BY name;")

    state_features = []
    for i, (name, geom_wkt) in enumerate(cur.fetchall(), start=1):
        geom = wkt.loads(geom_wkt)
        state_features.append(
            {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {"name": name}
            }
        )
        if i % 50 == 0:
            print(f"   Processed {i} state geometries...")

    app.state.state_boundary = {
        "type": "FeatureCollection",
        "features": state_features
    }

    print(f"✅ State boundaries loaded in memory: {len(state_features)} features.")
    # with open("cache_state_boundary.geojson") as f:
    #     app.state.state_boundary = json.load(f)

    print("🏙️ Loading district boundaries from DB...")
    cur.execute("SELECT id, name, geom.STAsText(), state_id FROM district_boundaries ORDER BY name;")

    district_features = []
    for i, (id_, name, geom_wkt, state_id) in enumerate(cur.fetchall(), start=1):
        geom = wkt.loads(geom_wkt)
        district_features.append(
            {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {
                    "id": id_,
                    "name": name,
                    "state_id": state_id
                },
            }
        )
        if i % 200 == 0:
            print(f"   Processed {i} district geometries...")

    app.state.district_boundary = {
        "type": "FeatureCollection",
        "features": district_features
    }
    print(f"✅ District boundaries loaded in memory: {len(district_features)} features.")
    # with open("cache_district_boundary.geojson") as f:
    #     app.state.district_boundary = json.load(f)
    
    # District names for search/filter UI
    print("📋 Loading district names from DB...")
    cur.execute("SELECT DISTINCT name FROM district_boundaries ORDER BY name;")
    districts = [row[0] for row in cur.fetchall()]
    
    app.state.districts = districts
    print(f"✅ District names loaded in memory: {len(districts)} names.")
    
    # Years available in the fact table for slider limits
    print("📅 Loading available years from DB...")
    cur.execute("SELECT DISTINCT year FROM fact_lulc_stats ORDER BY year;")
    years = [row[0] for row in cur.fetchall()]
    app.state.years = years
    print(f"✅ Years loaded in memory: {len(years)} years.")

    elapsed = time.time() - start_time
    print(f"✅ State & district metadata loaded in {elapsed:.2f} seconds")

    # Close initial DB resources before starting background tasks
    cur.close()
    conn.close()

    # Load heavy files (village boundary & LULC) in background
    async def load_heavy_files():
        """Load heavier reference layers (e.g., LULC preview) off the main thread."""
        print("Loading heavy files in background...")

        t1 = time.time()
        try:
            conn = get_connection()  
            cur = conn.cursor()

            # Example: Gujarat LULC (2022)
            print("🗺️ Loading Gujarat LULC (2022) from DB...")
            cur.execute("""
                SELECT 
                    geometry.STAsBinary() AS geom_bin, 
                    district_id, year, type_id
                FROM fact_lulc_stats WHERE year = 2022
            """)

            features = []
            for row in cur.fetchall():
                # geom = wkb.loads(row.geom_bin)  # WKB → Shapely geometry
                # features.append({
                #     "type": "Feature",
                #     "geometry": geom.__geo_interface__,  # Shapely → GeoJSON dict
                #     "properties": {"lulc_type": row.type_id}
                # })
                geom_bin = row[0]   # geometry.STAsBinary()
                type_id = row[3]    # type_id
                geom = wkb.loads(geom_bin)
                features.append({
                    "type": "Feature",
                    "geometry": geom.__geo_interface__,
                    "properties": {"lulc_type": type_id}
                })

            app.state.lulc_2022 = {
                "type": "FeatureCollection",
                "features": features
            }

            print(f"✅ Gujarat LULC loaded in memory: {len(features)} features.")

        except Exception as e:
            print("❌ Error loading LULC:", e)
        # with open("cache_lulc_2022.geojson") as f:
        #     app.state.lulc_2022 = json.load(f)
        # print(f"✅ Gujarat LULC 2022 loaded in {time.time()-t1:.2f} seconds")
        
    # Start background task
    asyncio.create_task(load_heavy_files())

    yield 
    print("Shutting down...")

# -------------------------------------------------------------------
# Instantiate the FastAPI app with lifespan
# -------------------------------------------------------------------
app = FastAPI(lifespan=lifespan)

# Enable CORS (allow frontend access)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Allow all origins (can restrict later)
    allow_credentials=True,
    allow_methods=["*"],        # Allow all HTTP methods
    allow_headers=["*"],        # Allow all headers
)

# Serve frontend (static files under /static)
from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory="Frontend"), name="static")

# Initialize safe defaults in app state so routes won't crash if startup fails
app.state.state_boundary = {"type": "FeatureCollection", "features": []}
app.state.district_boundary = {"type": "FeatureCollection", "features": []}
app.state.districts = []
app.state.years = []
app.state.lulc_2022 = {"type": "FeatureCollection", "features": []}

# Root route serves the frontend
@app.get("/")
def serve_frontend():
    return FileResponse("Frontend/index.html")

# -------------------------------------------------------------------
# API Routes
# -------------------------------------------------------------------
@app.get("/metadata")
async def get_all_metadata():
    """
    Endpoint: /metadata
    Returns available metadata including boundaries.
    """
    return JSONResponse(
        content={
            "district_boundary": app.state.district_boundary,
            "state_boundary": app.state.state_boundary,
        }
    )

@app.get("/lulc-preview")
def get_lulc_preview():
    """
    Endpoint: /lulc-preview
    Returns preview of Land Use Land Cover (LULC) data for 2022.
    """
    return JSONResponse(content=app.state.lulc_2022)


@app.get("/districts")
async def get_districts():
    """
    Endpoint: /districts
    Returns a list of all districts.
    """
    return JSONResponse(content=app.state.districts)


@app.get("/years")
async def get_years():
    """
    Endpoint: /years
    Returns available years for data visualization.
    """
    return JSONResponse(content=app.state.years)

@app.get("/lulc-geojson")
def get_lulc(district_id: list[str] = Query(...), year: int = Query(...)):
    """Return GeoJSON of LULC polygons filtered by district(s) and year.

    Accepts one or many district_id query params; dynamically builds the
    WHERE clause using parameterized placeholders to avoid injection.
    """
    print(f"Received: district_id={district_id}, year={year}")
    
    conn = None
    cursor = None
    try:
        conn = get_connection()
        if not conn:
            raise Exception("Failed to establish database connection.")
        cursor = conn.cursor()

        # Dynamically build the WHERE clause based on the number of districts
        if len(district_id) == 1:
            query = """
                SELECT 
                    district_id,
                    year,
                    type_id, 
                    area,
                    geometry.STAsText() AS geometry
                FROM fact_lulc_stats
                WHERE district_id = ?
                AND year = ?
            """
            params = [district_id[0], year]
        else:
            placeholders = ",".join("?" * len(district_id))
            query = f"""
                SELECT 
                    district_id,
                    year,
                    type_id, 
                    area,
                    geometry.STAsText() AS geometry
                FROM fact_lulc_stats
                WHERE district_id IN ({placeholders})
                AND year = ?
            """
            params = district_id + [year]

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Build GeoJSON FeatureCollection from rows
        features = []
        columns = [col[0] for col in cursor.description]

        for row in rows:
            row_dict = dict(zip(columns, row))
            wkt_geom = row_dict.pop("geometry")

            # Convert WKT → GeoJSON dict
            geom = wkt.loads(wkt_geom) if wkt_geom else None
            geometry = mapping(geom) if geom else None

            feature = {
                "type": "Feature",
                "geometry": geometry,
                "properties": row_dict,
            }
            features.append(feature)

        geojson = {"type": "FeatureCollection", "features": features}
        return geojson

    except Exception as e:
        print(f"Database error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal Server Error: Failed to process your request.",
        )
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            
@app.get("/lulc-types")
def get_lulc_types(type_id: list[int] = Query(...)):
    """Return mapping of LULC type IDs to readable names.

    The table name is quoted as [type] to avoid conflicts with reserved words.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        placeholders = ",".join("?" * len(type_id))
        query = f"""
            SELECT id, typename
            FROM [type]
            WHERE id IN ({placeholders})
        """
        cursor.execute(query, type_id)
        rows = cursor.fetchall()

        type_mapping = {row[0]: row[1] for row in rows}
        return type_mapping  # {1: "Built-up", 2: "Forest", ...}

    finally:
        if cursor: cursor.close()
        if conn: conn.close()
