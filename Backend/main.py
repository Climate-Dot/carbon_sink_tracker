# ==========================
# Standard Library Imports
# ==========================
from concurrent.futures import ThreadPoolExecutor  # For running background tasks
from contextlib import asynccontextmanager          # For FastAPI lifespan management
import json                                        # For working with JSON data
import os                                          # For environment variables and paths
import time                                        # For performance measurement / debugging

# ==========================
# Third-Party Imports
# ==========================
from dotenv import load_dotenv                     # For loading environment variables from .env file
from fastapi import FastAPI, Query, HTTPException  # FastAPI core and request handling
from fastapi.middleware.cors import CORSMiddleware # Middleware to allow cross-origin requests
from fastapi.responses import JSONResponse         # For structured API responses
import geopandas as gpd                            # For working with geospatial data (shapefiles, GeoDataFrames)
import pyodbc                                      # For SQL Server database connection
from shapely import wkt, wkb                        # For parsing WKT geometries
from shapely.geometry import mapping, shape              # For converting geometries to GeoJSON
# ==========================V

# ==========================
# FastAPI App & Executor
# ==========================
executor = ThreadPoolExecutor()       # Thread pool for background tasks

print("Starting up...")

# ==========================
# Load Environment Variables
# ==========================
load_dotenv("D:/ClimateDot/CarbonSink/Backend/credentials.env")

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")


# ==========================
# Database Connection Helper
# ==========================
def get_connection():
    """
    Create and return a SQL Server database connection using pyodbc.
    Uses credentials from environment variables.
    """
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={DB_HOST},{DB_PORT};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "TrustServerCertificate=Yes;"
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
# Geometry Conversion Helper
# ==========================
def safe_geom_wkt_to_geojson(geom_wkt):
    """
    Convert WKT geometry to GeoJSON format.

    Args:
        geom_wkt (str): Well-Known Text (WKT) representation of a geometry.

    Returns:
        dict | None: GeoJSON geometry dict if valid, otherwise None.
    """
    if not geom_wkt:
        return None

    try:
        geom = wkt.loads(geom_wkt)  # Parse WKT → Shapely geometry
        return mapping(geom)        # Convert Shapely → GeoJSON
    except Exception as e:
        print(f"Invalid geometry skipped: {e}")
        return None

# ==========================
# Lifespan Context for Startup
# ==========================
import asyncio
import time
import json
from fastapi import FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🔗 Connecting to database...")
    conn = get_connection()
    cur = conn.cursor()

    # Load small files synchronously
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
    
    # District names
    print("📋 Loading district names from DB...")
    cur.execute("SELECT DISTINCT name FROM district_boundaries ORDER BY name;")
    districts = [row[0] for row in cur.fetchall()]
    
    app.state.districts = districts
    print(f"✅ District names loaded in memory: {len(districts)} names.")
    # with open("cache_districts.json") as f:
    #     app.state.districts = json.load(f)

    elapsed = time.time() - start_time
    print(f"✅ State & district metadata loaded in {elapsed:.2f} seconds")

    # Load heavy files (village boundary & LULC) in background
    async def load_heavy_files():
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

            app.state.lulc_2020 = {
                "type": "FeatureCollection",
                "features": features
            }

            print(f"✅ Gujarat LULC loaded in memory: {len(features)} features.")

        except Exception as e:
            print("❌ Error loading LULC:", e)
        # with open("cache_lulc_2020.geojson") as f:
        #     app.state.lulc_2020 = json.load(f)
        # print(f"✅ Gujarat LULC 2020 loaded in {time.time()-t1:.2f} seconds")
        
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
    Returns preview of Land Use Land Cover (LULC) data for 2020.
    """
    return JSONResponse(content=app.state.lulc_2020)


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

        # Build GeoJSON
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
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        placeholders = ",".join("?" * len(type_id))
        query = f"""
            SELECT id, typename
            FROM type
            WHERE id IN ({placeholders})
        """
        cursor.execute(query, type_id)
        rows = cursor.fetchall()

        mapping = {row[0]: row[1] for row in rows}
        return mapping  # {1: "Built-up", 2: "Forest", ...}

    finally:
        if cursor: cursor.close()
        if conn: conn.close()
