# ==========================
# Standard Library Imports
# ==========================
from contextlib import asynccontextmanager          # For FastAPI lifespan management
import json                                        # For working with JSON data
import os                                          # For environment variables and paths
import time                                        # For performance measurement
import logging                                     # For proper logging

# ==========================
# Third-Party Imports
# ==========================
from dotenv import load_dotenv                     # For loading environment variables from .env file
from fastapi import FastAPI, Query, HTTPException  # FastAPI core and request handling
from fastapi.middleware.cors import CORSMiddleware # Middleware to allow cross-origin requests
from fastapi.responses import JSONResponse, FileResponse  # For structured API responses and serving files
from fastapi import Body
import pyodbc                                      # For SQL Server database connection
from shapely import wkt, wkb                        # For parsing WKT geometries
from shapely.geometry import mapping, shape               # For converting geometries to/from GeoJSON
import pandas as pd                                 # For Excel file processing
import numpy as np                                  # For numerical operations
# ==========================

# ==========================
# FastAPI App
# Create the API; state is populated during lifespan startup
# ==========================

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logger.info("Starting up Carbon Sink Tracker API...")

# ==========================
# Load Environment Variables
# ==========================
# Load DB credentials from local env file when running locally
env_path = os.path.join(os.path.dirname(__file__), "credentials.env")
logger.info(f"Loading environment from: {env_path}")

load_dotenv(env_path)

# Validate required environment variables
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

required_vars = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"]
missing_vars = [var for var in required_vars if not os.getenv(var)]

if missing_vars:
    logger.error(f"Missing required environment variables: {missing_vars}")
    raise ValueError(f"Missing required environment variables: {missing_vars}")

logger.info("Database configuration loaded successfully")

# Excel file path
EXCEL_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "Satellite Data.xlsx")
logger.info(f"Excel file path: {EXCEL_FILE_PATH}")


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
        "Connection Timeout=30;"
        "Command Timeout=60;"
    )
    return pyodbc.connect(conn_str)


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
    logger.info("Connecting to database...")
    conn = get_connection()
    cur = conn.cursor()

    # Load small/essential metadata synchronously
    start_time = time.time()
    logger.info("Loading state boundaries from database...")
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
            logger.info(f"Processed {i} state geometries...")

    app.state.state_boundary = {
        "type": "FeatureCollection",
        "features": state_features
    }

    logger.info(f"State boundaries loaded: {len(state_features)} features")

    logger.info("Loading district boundaries from database...")
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
            logger.info(f"Processed {i} district geometries...")

    app.state.district_boundary = {
        "type": "FeatureCollection",
        "features": district_features
    }
    logger.info(f"District boundaries loaded: {len(district_features)} features")
    
    # District names for search/filter UI
    logger.info("Loading district names from database...")
    cur.execute("SELECT DISTINCT name FROM district_boundaries ORDER BY name;")
    districts = [row[0] for row in cur.fetchall()]
    
    app.state.districts = districts
    logger.info(f"District names loaded: {len(districts)} names")
    
    # Years available in the fact table for slider limits
    logger.info("Loading available years from database...")
    cur.execute("SELECT DISTINCT year FROM fact_lulc_stats ORDER BY year;")
    years = [row[0] for row in cur.fetchall()]
    app.state.years = years
    logger.info(f"Years loaded: {len(years)} years")

    elapsed = time.time() - start_time
    logger.info(f"Metadata loaded in {elapsed:.2f} seconds")

    # Close initial DB resources before starting background tasks
    cur.close()
    conn.close()

    # Initialize empty LULC data - will be loaded on demand to save memory
    logger.info("LULC data will be loaded on demand to save memory")

    yield 
    logger.info("Shutting down Carbon Sink Tracker API...")

# -------------------------------------------------------------------
# Instantiate the FastAPI app with lifespan
# -------------------------------------------------------------------
app = FastAPI(lifespan=lifespan)

# Enable CORS (configure for production)
# In development, allow both localhost and null origins (for file:// protocol)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,null").split(",")
allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]  # Clean up and remove empty strings

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,  # Set to False when allowing null origin
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


from fastapi.staticfiles import StaticFiles

# Serve frontend static files - use absolute path
frontend_path = os.path.join(os.path.dirname(__file__), "..", "Frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")
app.state.state_boundary = {"type": "FeatureCollection", "features": []}
app.state.district_boundary = {"type": "FeatureCollection", "features": []}
app.state.districts = []
app.state.years = []

# Root route serves the frontend
@app.get("/")
def serve_frontend():
    frontend_file = os.path.join(os.path.dirname(__file__), "..", "Frontend", "index.html")
    return FileResponse(frontend_file)

# Alternative route to serve frontend via static files
@app.get("/app")
def serve_frontend_static():
    frontend_file = os.path.join(os.path.dirname(__file__), "..", "Frontend", "index.html")
    return FileResponse(frontend_file)

# -------------------------------------------------------------------
# API Routes
# -------------------------------------------------------------------
@app.get("/health")
def health_check():
    """Health check endpoint for Render"""
    return {"status": "healthy", "message": "Carbon Sink Tracker API is running"}

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
    logger.info(f"LULC request: {len(district_id)} districts, year {year}")
    
    conn = None
    cursor = None
    try:
        conn = get_connection()
        if not conn:
            raise Exception("Failed to establish database connection.")
        cursor = conn.cursor()

        # Dynamically build the WHERE clause based on the number of districts
        # Add LIMIT to prevent memory issues on large datasets
        # Return all LULC types (no filtering)
        if len(district_id) == 1:
            query = """
                SELECT TOP 2000
                    district_id,
                    year,
                    type_id, 
                    area,
                    geometry.STAsText() AS geometry
                FROM fact_lulc_stats
                WHERE district_id = ?
                AND year = ?
                ORDER BY area DESC
            """
            params = [district_id[0], year]
        else:
            placeholders = ",".join("?" * len(district_id))
            query = f"""
                SELECT TOP 5000
                    district_id,
                    year,
                    type_id, 
                    area,
                    geometry.STAsText() AS geometry
                FROM fact_lulc_stats
                WHERE district_id IN ({placeholders})
                AND year = ?
                ORDER BY area DESC
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
        logger.error(f"Database error in LULC endpoint: {e}")
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

@app.post("/lulc-by-polygon")
def get_lulc_by_polygon(geojson: dict = Body(...), year: int = Query(...)):
    """Return LULC features intersecting the provided GeoJSON polygon for a year.

    Accepts a GeoJSON geometry (Polygon or MultiPolygon). Converts it to WKT and
    performs a spatial intersection against fact_lulc_stats.geometry.
    """
    try:
        geom = shape(geojson)
        logger.info(f"Original geometry valid: {geom.is_valid}")
        # Try to make the geometry valid if it's not
        if not geom.is_valid:
            logger.info("Geometry is invalid, attempting to fix with buffer(0)")
            geom = geom.buffer(0)  # This often fixes invalid geometries
            logger.info(f"Fixed geometry valid: {geom.is_valid}")
        wkt_polygon = geom.wkt
        logger.info(f"WKT polygon length: {len(wkt_polygon)}")
    except Exception as e:
        logger.error(f"Geometry processing error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON: {e}")

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Use STIntersects to filter polygons by intersection with input geometry
        # Add TOP 1000 to prevent memory issues with large polygon queries
        # Try bounding box approach first, then filter in Python
        query = (
            """
            SELECT TOP 1000
                district_id,
                year,
                type_id,
                area,
                geometry.STAsText() AS geometry
            FROM fact_lulc_stats
            WHERE year = ?
            ORDER BY area DESC
            """
        )
        cursor.execute(query, [year])
        rows = cursor.fetchall()

        features = []
        columns = [col[0] for col in cursor.description]
        for row in rows:
            row_dict = dict(zip(columns, row))
            wkt_geom = row_dict.pop("geometry")
            geom = wkt.loads(wkt_geom) if wkt_geom else None
            geometry = mapping(geom) if geom else None
            
            # Check if this feature intersects with our query polygon
            if geometry:
                feature_geom = shape(geometry)
                if feature_geom.is_valid and feature_geom.intersects(geom):
                    features.append({
                        "type": "Feature",
                        "geometry": geometry,
                        "properties": row_dict,
                    })

        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        logger.error(f"Database error in polygon query: {e}")
        raise HTTPException(status_code=500, detail="Failed to query LULC by polygon")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ==========================
# Excel Data Processing Functions
# ==========================

def load_excel_data():
    """Load and cache Excel data for forest state and district emissions."""
    try:
        logger.info(f"Looking for Excel file at: {EXCEL_FILE_PATH}")
        logger.info(f"File exists: {os.path.exists(EXCEL_FILE_PATH)}")
        
        # Check if Excel file exists
        if not os.path.exists(EXCEL_FILE_PATH):
            raise FileNotFoundError(f"Excel file not found: {EXCEL_FILE_PATH}")
        
        logger.info("Loading State_Restructured sheet...")
        # Load State_Restructured sheet for forest state data
        state_df = pd.read_excel(EXCEL_FILE_PATH, sheet_name='FL_State_Restructured')
        logger.info(f"State sheet loaded successfully. Shape: {state_df.shape}")
        
        logger.info("Loading Dist_Wise Restructured sheet...")
        # Load Dist_Wise Restructured sheet for forest district data
        district_df = pd.read_excel(EXCEL_FILE_PATH, sheet_name='FL_Dist_Wise_Restructured')
        logger.info(f"District sheet loaded successfully. Shape: {district_df.shape}")
        
        return state_df, district_df
    except Exception as e:
        logger.error(f"Error loading Excel data: {e}")
        raise e


def load_wetland_excel_data():
    """Load and cache Excel data for wetland state and district emissions."""
    try:
        logger.info(f"Looking for Excel file at: {EXCEL_FILE_PATH}")
        logger.info(f"File exists: {os.path.exists(EXCEL_FILE_PATH)}")
        
        # Check if Excel file exists
        if not os.path.exists(EXCEL_FILE_PATH):
            raise FileNotFoundError(f"Excel file not found: {EXCEL_FILE_PATH}")
        
        logger.info("Loading WL_State_Restructured sheet...")
        # Load WL_State_Restructured sheet for wetland state data
        state_df = pd.read_excel(EXCEL_FILE_PATH, sheet_name='WL_State_Restructured')
        logger.info(f"Wetland state sheet loaded successfully. Shape: {state_df.shape}")
        
        logger.info("Loading WL_Dist_Wise_Restructured sheet...")
        # Load WL_Dist_Wise_Restructured sheet for wetland district data
        district_df = pd.read_excel(EXCEL_FILE_PATH, sheet_name='WL_Dist_Wise_Restructured')
        logger.info(f"Wetland district sheet loaded successfully. Shape: {district_df.shape}")
        
        return state_df, district_df
    except Exception as e:
        logger.error(f"Error loading wetland Excel data: {e}")
        raise e


def process_state_data(state_df):
    """Process forest state data from Excel sheet."""
    try:
        # Ensure we have the required columns
        required_columns = ['Year', 'Emission (Ton yr^-1)/(Conversion of C to CO2)']
        if not all(col in state_df.columns for col in required_columns):
            raise ValueError(f"Missing required columns. Expected: {required_columns}, Found: {list(state_df.columns)}")
        
        # Group by year and sum the emissions (since there are multiple rows per year)
        yearly_data = state_df.groupby('Year')['Emission (Ton yr^-1)/(Conversion of C to CO2)'].sum().reset_index()
        
        # Filter out 2011 and 2023+ data - start from 2012
        yearly_data = yearly_data[(yearly_data['Year'] >= 2012) & (yearly_data['Year'] <= 2022)]
        
        # Sort by year to ensure chronological order
        yearly_data = yearly_data.sort_values('Year')
        
        # Extract years and emissions
        years = yearly_data['Year'].astype(str).tolist()
        forest_emissions = yearly_data['Emission (Ton yr^-1)/(Conversion of C to CO2)'].astype(float).tolist()
        
        return {
            "years": years,
            "forest_emissions": forest_emissions
        }
    except Exception as e:
        logger.error(f"Error processing forest state data: {e}")
        raise e


def process_wetland_state_data(state_df):
    """Process wetland state data from Excel sheet."""
    try:
        # Ensure we have the required columns
        required_columns = ['Year', 'Emission (Ton yr^-1)/(Conversion of C to CO2)']
        if not all(col in state_df.columns for col in required_columns):
            raise ValueError(f"Missing required columns. Expected: {required_columns}, Found: {list(state_df.columns)}")
        
        # Group by year and sum the emissions (since there are multiple rows per year)
        yearly_data = state_df.groupby('Year')['Emission (Ton yr^-1)/(Conversion of C to CO2)'].sum().reset_index()
        
        # Filter out 2011 and 2023+ data - start from 2012 (same as forest)
        yearly_data = yearly_data[(yearly_data['Year'] >= 2012) & (yearly_data['Year'] <= 2022)]
        
        # Sort by year to ensure chronological order
        yearly_data = yearly_data.sort_values('Year')
        
        # Extract years and emissions
        years = yearly_data['Year'].astype(str).tolist()
        wetland_emissions = yearly_data['Emission (Ton yr^-1)/(Conversion of C to CO2)'].astype(float).tolist()
        
        return {
            "years": years,
            "wetland_emissions": wetland_emissions
        }
    except Exception as e:
        logger.error(f"Error processing wetland state data: {e}")
        raise e


def process_district_data(district_df):
    """Process forest district data from Excel sheet."""
    try:
        # Ensure we have the required columns
        required_columns = ['District', 'Year', 'Emission (Ton yr^-1)/(Conversion of C to CO2)']
        if not all(col in district_df.columns for col in required_columns):
            raise ValueError(f"Missing required columns. Expected: {required_columns}, Found: {list(district_df.columns)}")
        
        # Clean up district names - remove "Total" suffix and fix naming inconsistencies
        district_df = district_df.copy()
        district_df['District'] = district_df['District'].str.replace(' Total', '')
        district_df['District'] = district_df['District'].str.replace('_', ' ')
        
        # Map Excel district names to frontend expected names
        district_name_mapping = {
            'Ahmadabad': 'Ahmadabad',
            'Amreli': 'Amreli',
            'Anand': 'Anand',
            'Arvalli': 'Arvalli',
            'Banas Kantha': 'Banaskantha',
            'Bharuch': 'Bharuch',
            'Bhavnagar': 'Bhavnagar',
            'Botad': 'Botad',
            'Chhotaudepur': 'Chhotaudepur',
            'Dahod': 'Dahod',
            'Dangs': 'Dangs',
            'Devbhumi Dwarka': 'Devbhumi dwarka',
            'Gandhinagar': 'Gandhinagar',
            'Gir Somnath': 'Gir somnath',
            'Jamnagar': 'Jamnagar',
            'Junagadh': 'Junagadh',
            'Kachchh': 'Kachchh',
            'Kheda': 'Kheda',
            'Mahesana': 'Mahesana',
            'Mahisagar': 'Mahisagar',
            'Morbi': 'Morbi',
            'Narmada': 'Narmada',
            'Navsari': 'Navsari',
            'Panch Mahals': 'Panchmahals',
            'Patan': 'Patan',
            'Porbandar': 'Porbandar',
            'Rajkot': 'Rajkot',
            'Sabar Kantha': 'Sabakantha',
            'Surat': 'Surat',
            'Surendranagar': 'Surendranagar',
            'Tapi': 'Tapi',
            'Vadodara': 'Vadodara',
            'Valsad': 'Valsad'
        }
        
        # Apply district name mapping
        district_df['District'] = district_df['District'].map(district_name_mapping).fillna(district_df['District'])
        
        # Group by district and year, then sum the emissions (since there are multiple rows per district per year)
        yearly_district_data = district_df.groupby(['District', 'Year'])['Emission (Ton yr^-1)/(Conversion of C to CO2)'].sum().reset_index()
        
        # Filter out 2011 and 2023+ data - start from 2012
        yearly_district_data = yearly_district_data[(yearly_district_data['Year'] >= 2012) & (yearly_district_data['Year'] <= 2022)]
        
        # Get unique districts and years
        districts = sorted(yearly_district_data['District'].unique().tolist())
        years = sorted(yearly_district_data['Year'].unique().astype(str).tolist())
        
        logger.info(f"Processing {len(districts)} districts for {len(years)} years")
        
        # Initialize data structures
        forest_emissions = {}
        
        # Process each district
        for district in districts:
            district_data = yearly_district_data[yearly_district_data['District'] == district].sort_values('Year')
            
            # Extract forest emissions for this district (aggregated by year)
            district_forest = district_data['Emission (Ton yr^-1)/(Conversion of C to CO2)'].astype(float).tolist()
            forest_emissions[district] = district_forest
        
        logger.info(f"Processed {len(districts)} districts")
        
        return {
            "years": years,
            "districts": districts,
            "forest_emissions": forest_emissions
        }
    except Exception as e:
        logger.error(f"Error processing forest district data: {e}")
        raise e


def process_wetland_district_data(district_df):
    """Process wetland district data from Excel sheet."""
    try:
        # Ensure we have the required columns
        required_columns = ['District', 'Year', 'Emission (Ton yr^-1)/(Conversion of C to CO2)']
        if not all(col in district_df.columns for col in required_columns):
            raise ValueError(f"Missing required columns. Expected: {required_columns}, Found: {list(district_df.columns)}")
        
        # Clean up district names - remove "Total" suffix and fix naming inconsistencies
        district_df = district_df.copy()
        district_df['District'] = district_df['District'].str.replace(' Total', '')
        district_df['District'] = district_df['District'].str.replace('_', ' ')
        
        # Map Excel district names to frontend expected names
        district_name_mapping = {
            'Ahmadabad': 'Ahmadabad',
            'Amreli': 'Amreli',
            'Anand': 'Anand',
            'Arvalli': 'Arvalli',
            'Banas Kantha': 'Banaskantha',
            'Bharuch': 'Bharuch',
            'Bhavnagar': 'Bhavnagar',
            'Botad': 'Botad',
            'Chhotaudepur': 'Chhotaudepur',
            'Dahod': 'Dahod',
            'Dangs': 'Dangs',
            'Devbhumi Dwarka': 'Devbhumi dwarka',
            'Gandhinagar': 'Gandhinagar',
            'Gir Somnath': 'Gir somnath',
            'Jamnagar': 'Jamnagar',
            'Junagadh': 'Junagadh',
            'Kachchh': 'Kachchh',
            'Kheda': 'Kheda',
            'Mahesana': 'Mahesana',
            'Mahisagar': 'Mahisagar',
            'Morbi': 'Morbi',
            'Narmada': 'Narmada',
            'Navsari': 'Navsari',
            'Panch Mahals': 'Panchmahals',
            'Patan': 'Patan',
            'Porbandar': 'Porbandar',
            'Rajkot': 'Rajkot',
            'Sabar Kantha': 'Sabakantha',
            'Surat': 'Surat',
            'Surendranagar': 'Surendranagar',
            'Tapi': 'Tapi',
            'Vadodara': 'Vadodara',
            'Valsad': 'Valsad'
        }
        
        # Apply district name mapping
        district_df['District'] = district_df['District'].map(district_name_mapping).fillna(district_df['District'])
        
        # Group by district and year, then sum the emissions (since there are multiple rows per district per year)
        yearly_district_data = district_df.groupby(['District', 'Year'])['Emission (Ton yr^-1)/(Conversion of C to CO2)'].sum().reset_index()
        
        # Filter out 2011 and 2023+ data - start from 2012
        yearly_district_data = yearly_district_data[(yearly_district_data['Year'] >= 2012) & (yearly_district_data['Year'] <= 2022)]
        
        # Get unique districts and years
        districts = sorted(yearly_district_data['District'].unique().tolist())
        years = sorted(yearly_district_data['Year'].unique().astype(str).tolist())
        logger.info(f"Processing {len(districts)} districts for {len(years)} years")

        # Initialize data structures
        wetland_emissions = {}
        
        # Process each district
        for district in districts:
            district_data = yearly_district_data[yearly_district_data['District'] == district].sort_values('Year')
            
            # Extract wetland emissions for this district (aggregated by year)
            district_wetland = district_data['Emission (Ton yr^-1)/(Conversion of C to CO2)'].astype(float).tolist()
            wetland_emissions[district] = district_wetland
        
        logger.info(f"Processed {len(districts)} districts")
        
        return {
            "years": years,
            "districts": districts,
            "wetland_emissions": wetland_emissions
        }
    except Exception as e:
        logger.error(f"Error processing wetland district data: {e}")
        raise e


# ==========================
# Excel Data API Endpoints
# ==========================

@app.get("/state-data")
async def get_state_data():
    """Get forest state-level emissions data from Excel file."""
    try:
        # Load Excel data
        state_df, _ = load_excel_data()
        
        # Process state data
        state_data = process_state_data(state_df)
        
        return JSONResponse(content=state_data)
    
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Excel file not found: {str(e)}")
    except Exception as e:
        logger.error(f"Error in get_state_data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load state data: {str(e)}")


@app.get("/wetland-state-data")
async def get_wetland_state_data():
    """Get wetland state-level emissions data from Excel file."""
    try:
        # Load Excel data
        state_df, _ = load_wetland_excel_data()
        
        # Process state data
        state_data = process_wetland_state_data(state_df)
        
        return JSONResponse(content=state_data)
    
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Excel file not found: {str(e)}")
    except Exception as e:
        logger.error(f"Error in get_wetland_state_data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load wetland state data: {str(e)}")


@app.get("/district-data")
async def get_district_data():
    """Get forest district-level emissions data from Excel file."""
    try:
        # Load Excel data
        _, district_df = load_excel_data()
        
        # Process district data
        district_data = process_district_data(district_df)
        
        return JSONResponse(content=district_data)
    
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Excel file not found: {str(e)}")
    except Exception as e:
        logger.error(f"Error in get_district_data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load district data: {str(e)}")


@app.get("/wetland-district-data")
async def get_wetland_district_data():
    """Get wetland district-level emissions data from Excel file."""
    try:
        # Load Excel data
        _, district_df = load_wetland_excel_data()
        
        # Process district data
        district_data = process_wetland_district_data(district_df)
        
        return JSONResponse(content=district_data)
    
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Excel file not found: {str(e)}")
    except Exception as e:
        logger.error(f"Error in get_wetland_district_data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load wetland district data: {str(e)}")
